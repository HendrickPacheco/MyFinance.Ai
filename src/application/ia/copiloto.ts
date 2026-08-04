/**
 * Loop do agente (D3): pergunta → chamadas de ferramenta → resposta.
 *
 * O que este arquivo garante, e que nenhuma outra camada consegue garantir:
 *
 *  · LIMITE DURO DE TURNOS. Estourou, responde honestamente que não concluiu.
 *    Nunca um palpite montado com dados parciais.
 *  · PROVENIÊNCIA. Devolve quais ferramentas foram usadas e quais valores
 *    formatados delas aparecem no texto final — é o que permite à UI mostrar
 *    que o número veio do motor.
 *  · DETECÇÃO DE VALOR NÃO RASTREADO. Se o texto final cita um "R$ ..." que
 *    nenhuma ferramenta devolveu, isso é sinalizado. É a rede de segurança
 *    contra o risco nº 1 do plano: alucinação de número, que é pior que mock
 *    em tela porque parece verdade.
 *
 * Sem estado global: o histórico entra por parâmetro (CLAUDE.md regra 6).
 * Nenhum cálculo mora aqui — este arquivo orquestra, não conta.
 */
import type { Deps } from '@/application/deps';
import type { ChamadaFerramenta, ConsumoTokens, MensagemIA } from '@/domain/ports/ia';
import { definicoesParaProvedor } from './ferramentas/catalogo';
import { executarFerramenta } from './ferramentas';
import type { SaidaFerramenta } from './ferramentas/saida';
import {
  MENSAGEM_LIMITE_DE_TURNOS,
  MENSAGEM_SEM_RESPOSTA,
  PROMPT_SISTEMA,
} from './prompt-sistema';

/** Teto de idas ao modelo numa única pergunta. Defesa de custo e de loop. */
export const MAX_TURNOS = 6;

/** Encontra "R$ 1.234,56" no texto — o formato que `formatBRL` produz. */
const VALOR_BRL = /R\$\s?\d{1,3}(?:\.\d{3})*,\d{2}/g;

export class CopilotoIndisponivelError extends Error {
  constructor() {
    super(
      'A camada de IA está desligada. Preencha OPENAI_API_KEY e IA_HABILITADA=true no .env para usar o copiloto.',
    );
    this.name = 'CopilotoIndisponivelError';
  }
}

export interface FerramentaUsada {
  nome: string;
  argumentos: unknown;
  /** Função pura de origem, para a UI exibir proveniência. */
  comoFoiCalculado: string | null;
  /** A ferramenta devolveu `{ erro }` em vez de dado. */
  falhou: boolean;
}

export interface ValorCitado {
  valorFormatado: string;
  ferramenta: string;
  campo: string;
}

export interface RespostaCopiloto {
  texto: string;
  ferramentasUsadas: FerramentaUsada[];
  /** Valores do texto final que vieram comprovadamente de uma ferramenta. */
  valoresCitados: ValorCitado[];
  /**
   * Valores em R$ no texto final que NENHUMA ferramenta devolveu. Não vazio =
   * o modelo inventou ou recompôs um número. A UI trata isso como alerta.
   */
  valoresNaoRastreados: string[];
  /** Resposta sem nenhuma ferramenta é opinião, não dado (a UI sinaliza). */
  semFerramenta: boolean;
  /** `true` quando o loop foi cortado pelo limite de turnos. */
  incompleta: boolean;
  turnosUsados: number;
  consumo: ConsumoTokens;
}

export async function responder(
  deps: Deps,
  entrada: { pergunta: string; historico?: readonly MensagemIA[] },
): Promise<RespostaCopiloto> {
  const ia = deps.ia;
  if (!ia) throw new CopilotoIndisponivelError();

  const mensagens: MensagemIA[] = [
    { papel: 'sistema', conteudo: PROMPT_SISTEMA },
    ...(entrada.historico ?? []),
    { papel: 'usuario', conteudo: entrada.pergunta },
  ];

  const ferramentas = definicoesParaProvedor();
  const usadas: FerramentaUsada[] = [];
  const saidas: { nome: string; saida: SaidaFerramenta }[] = [];
  const consumo: ConsumoTokens = { entrada: 0, saida: 0 };

  for (let turno = 1; turno <= MAX_TURNOS; turno += 1) {
    const resultado = await ia.completarComTools({ mensagens, ferramentas });
    consumo.entrada += resultado.consumo?.entrada ?? 0;
    consumo.saida += resultado.consumo?.saida ?? 0;

    if (resultado.resposta.tipo === 'TEXTO') {
      return montarResposta({
        texto: resultado.resposta.texto || MENSAGEM_SEM_RESPOSTA,
        usadas,
        saidas,
        incompleta: false,
        turnosUsados: turno,
        consumo,
      });
    }

    mensagens.push({ papel: 'assistente', conteudo: '', chamadas: resultado.resposta.chamadas });

    for (const chamada of resultado.resposta.chamadas) {
      const saida = await executarFerramenta(deps, chamada.nome, chamada.argumentos);
      usadas.push(registrar(chamada, saida));
      saidas.push({ nome: chamada.nome, saida });
      mensagens.push({
        papel: 'ferramenta',
        idChamada: chamada.id,
        nome: chamada.nome,
        conteudo: JSON.stringify(saida),
      });
    }
  }

  // Estourou o limite. Resposta honesta, sem nenhum número — o modelo pode ter
  // visto dados parciais, e narrar meia resposta é pior que admitir a falha.
  return montarResposta({
    texto: MENSAGEM_LIMITE_DE_TURNOS,
    usadas,
    saidas,
    incompleta: true,
    turnosUsados: MAX_TURNOS,
    consumo,
  });
}

function registrar(chamada: ChamadaFerramenta, saida: SaidaFerramenta): FerramentaUsada {
  const comoFoiCalculado = saida.comoFoiCalculado;
  return {
    nome: chamada.nome,
    argumentos: chamada.argumentos,
    comoFoiCalculado: typeof comoFoiCalculado === 'string' ? comoFoiCalculado : null,
    falhou: saida.erro !== undefined,
  };
}

/** Todo par (campo, valor formatado) que as ferramentas devolveram. */
function valoresDisponiveis(
  saidas: readonly { nome: string; saida: SaidaFerramenta }[],
): ValorCitado[] {
  const encontrados: ValorCitado[] = [];

  const visitar = (valor: unknown, ferramenta: string): void => {
    if (Array.isArray(valor)) {
      for (const item of valor) visitar(item, ferramenta);
      return;
    }
    if (typeof valor !== 'object' || valor === null) return;

    for (const [campo, conteudo] of Object.entries(valor as Record<string, unknown>)) {
      if (campo.endsWith('Formatado') && typeof conteudo === 'string') {
        encontrados.push({ valorFormatado: conteudo, ferramenta, campo });
      }
      visitar(conteudo, ferramenta);
    }
  };

  for (const { nome, saida } of saidas) visitar(saida, nome);
  return encontrados;
}

function montarResposta(params: {
  texto: string;
  usadas: FerramentaUsada[];
  saidas: readonly { nome: string; saida: SaidaFerramenta }[];
  incompleta: boolean;
  turnosUsados: number;
  consumo: ConsumoTokens;
}): RespostaCopiloto {
  const disponiveis = valoresDisponiveis(params.saidas);

  const citados = disponiveis.filter((v) => params.texto.includes(v.valorFormatado));

  // Normaliza o espaço para não acusar falso positivo entre "R$ 83,00" e
  // "R$&nbsp;83,00": a comparação é sobre o valor, não sobre o byte.
  const normalizar = (s: string): string => s.replace(/\s/g, ' ');
  const conhecidos = new Set(disponiveis.map((v) => normalizar(v.valorFormatado)));
  const naoRastreados = [
    ...new Set(
      (params.texto.match(VALOR_BRL) ?? [])
        .map(normalizar)
        .filter((valor) => !conhecidos.has(valor)),
    ),
  ];

  return {
    texto: params.texto,
    ferramentasUsadas: params.usadas,
    valoresCitados: citados,
    valoresNaoRastreados: naoRastreados,
    semFerramenta: params.usadas.length === 0,
    incompleta: params.incompleta,
    turnosUsados: params.turnosUsados,
    consumo: params.consumo,
  };
}
