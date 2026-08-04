/**
 * Adapter concreto de `ProvedorIAPort`. É o ÚNICO lugar do repo que importa o
 * SDK do provedor. O domínio não sabe que isto existe.
 *
 * Responsabilidades, e só estas:
 *   - traduzir mensagens e ferramentas do domínio para o formato do SDK;
 *   - validar de volta, com o MESMO schema Zod, os argumentos que o modelo
 *     devolveu — nada meio-preenchido passa adiante;
 *   - transformar qualquer falha do SDK em `ErroProvedorIA` tipado.
 *
 * Não faz loop de turnos (isso é do caso de uso) e não faz conta nenhuma.
 *
 * POR QUE A RESPONSES API, E NÃO CHAT COMPLETIONS (achado da A0.5, 04/08/2026):
 * o modelo configurado é de raciocínio, e a API recusa function tools em
 * `/v1/chat/completions` com raciocínio ligado — exige `/v1/responses` ou
 * `reasoning_effort: 'none'`. Desligar o raciocínio degradaria exatamente a
 * capacidade de que a Fase D depende (escolher a ferramenta certa entre várias
 * parecidas), então o adapter fala Responses.
 */
import OpenAI from 'openai';
import type { Responses } from 'openai/resources/responses/responses';
import {
  ErroProvedorIA,
  type ChamadaFerramenta,
  type DefinicaoFerramenta,
  type MensagemIA,
  type ProvedorIAPort,
  type ResultadoTurno,
} from '@/domain/ports/ia';
import { lerConfigIA, type ConfigIA } from './config-ia';
import { paraJsonSchemaEstrito } from './esquema-json';

type ItemEntrada = Responses.ResponseInputItem;

/**
 * Uma mensagem do domínio pode virar VÁRIOS itens de entrada: um turno do
 * assistente que pediu duas ferramentas vira dois itens `function_call`.
 */
function paraItensSDK(mensagem: MensagemIA): ItemEntrada[] {
  switch (mensagem.papel) {
    case 'sistema':
      return [{ role: 'system', content: mensagem.conteudo }];
    case 'usuario':
      return [{ role: 'user', content: mensagem.conteudo }];
    case 'assistente': {
      const itens: ItemEntrada[] = [];
      if (mensagem.conteudo) itens.push({ role: 'assistant', content: mensagem.conteudo });
      for (const chamada of mensagem.chamadas ?? []) {
        itens.push({
          type: 'function_call',
          call_id: chamada.id,
          name: chamada.nome,
          arguments: JSON.stringify(chamada.argumentos),
        });
      }
      return itens;
    }
    case 'ferramenta':
      return [
        { type: 'function_call_output', call_id: mensagem.idChamada, output: mensagem.conteudo },
      ];
  }
}

function paraFerramentaSDK(ferramenta: DefinicaoFerramenta): Responses.FunctionTool {
  return {
    type: 'function',
    name: ferramenta.nome,
    description: ferramenta.descricao,
    parameters: paraJsonSchemaEstrito(ferramenta.argumentos, ferramenta.nome),
    strict: true,
  };
}

function traduzirErro(erro: unknown): ErroProvedorIA {
  if (erro instanceof ErroProvedorIA) return erro;

  if (erro instanceof OpenAI.APIError) {
    if (erro.status === 429) {
      return new ErroProvedorIA('LIMITE_EXCEDIDO', 'Limite de uso da API excedido.', erro);
    }
    if (erro.status === 400 && /content|policy|refus/i.test(erro.message)) {
      return new ErroProvedorIA('CONTEUDO_RECUSADO', 'O provedor recusou o conteúdo.', erro);
    }
    return new ErroProvedorIA('INDISPONIVEL', `Provedor de IA indisponível: ${erro.message}`, erro);
  }

  const mensagem = erro instanceof Error ? erro.message : String(erro);
  return new ErroProvedorIA('INDISPONIVEL', `Falha ao falar com o provedor de IA: ${mensagem}`, erro);
}

/** Procura uma recusa explícita entre os itens de saída. */
function acharRecusa(saida: readonly Responses.ResponseOutputItem[]): string | null {
  for (const item of saida) {
    if (item.type !== 'message') continue;
    for (const parte of item.content) {
      if (parte.type === 'refusal') return parte.refusal;
    }
  }
  return null;
}

export class ProvedorIAOpenAI implements ProvedorIAPort {
  constructor(
    private readonly cliente: OpenAI,
    private readonly config: ConfigIA,
  ) {}

  async completarComTools(entrada: {
    mensagens: readonly MensagemIA[];
    ferramentas: readonly DefinicaoFerramenta[];
  }): Promise<ResultadoTurno> {
    const itens = entrada.mensagens.flatMap(paraItensSDK);

    try {
      return await this.turno(itens, entrada.ferramentas);
    } catch (erro) {
      const traduzido = traduzirErro(erro);

      // Uma única re-solicitação, e só para schema inválido: devolve ao modelo
      // o erro de validação para ele se corrigir. Segunda falha propaga.
      if (traduzido.motivo !== 'SCHEMA_INVALIDO') throw traduzido;

      const comCorrecao: ItemEntrada[] = [
        ...itens,
        {
          role: 'user',
          content:
            `Os argumentos da última chamada de ferramenta não passaram na validação: ${traduzido.message}. ` +
            'Chame a ferramenta de novo respeitando exatamente o schema declarado.',
        },
      ];

      try {
        return await this.turno(comCorrecao, entrada.ferramentas);
      } catch (segundoErro) {
        throw traduzirErro(segundoErro);
      }
    }
  }

  private async turno(
    itens: ItemEntrada[],
    ferramentas: readonly DefinicaoFerramenta[],
  ): Promise<ResultadoTurno> {
    const resposta = await this.cliente.responses.create({
      model: this.config.modelo,
      input: itens,
      tools: ferramentas.map(paraFerramentaSDK),
      store: false,
    });

    const consumo = resposta.usage
      ? { entrada: resposta.usage.input_tokens, saida: resposta.usage.output_tokens }
      : undefined;

    const recusa = acharRecusa(resposta.output);
    if (recusa) throw new ErroProvedorIA('CONTEUDO_RECUSADO', recusa);

    const chamadasBrutas = resposta.output.filter(
      (item): item is Responses.ResponseFunctionToolCall => item.type === 'function_call',
    );

    if (chamadasBrutas.length > 0) {
      const chamadas = chamadasBrutas.map((chamada) =>
        this.validarChamada(chamada.call_id, chamada.name, chamada.arguments, ferramentas),
      );
      return { resposta: { tipo: 'FERRAMENTAS', chamadas }, consumo };
    }

    return { resposta: { tipo: 'TEXTO', texto: resposta.output_text }, consumo };
  }

  /**
   * Valida os argumentos com o MESMO schema Zod que gerou o JSON Schema
   * daquela ferramenta.
   *
   * Ferramenta desconhecida NÃO é erro aqui: não há schema contra o que
   * validar, e quem sabe o que fazer com isso é o loop do agente — que
   * responde ao modelo que a ferramenta não existe em vez de morrer.
   */
  private validarChamada(
    id: string,
    nome: string,
    argumentosJson: string,
    ferramentas: readonly DefinicaoFerramenta[],
  ): ChamadaFerramenta {
    let bruto: unknown;
    try {
      bruto = JSON.parse(argumentosJson) as unknown;
    } catch {
      throw new ErroProvedorIA(
        'SCHEMA_INVALIDO',
        `Argumentos da ferramenta "${nome}" não são JSON válido.`,
      );
    }

    const definicao = ferramentas.find((f) => f.nome === nome);
    if (!definicao) return { id, nome, argumentos: bruto };

    const validado = definicao.argumentos.safeParse(bruto);
    if (!validado.success) {
      throw new ErroProvedorIA(
        'SCHEMA_INVALIDO',
        `Argumentos da ferramenta "${nome}" não batem com o schema: ${validado.error.message}`,
        validado.error,
      );
    }

    return { id, nome, argumentos: validado.data };
  }
}

/** Monta o provedor a partir do ambiente. Só o composition root chama isto. */
export function criarProvedorIA(): ProvedorIAPort {
  const config = lerConfigIA();
  const cliente = new OpenAI({
    apiKey: config.apiKey,
    timeout: config.timeoutMs,
    maxRetries: Math.max(0, config.maxTentativas - 1),
  });
  return new ProvedorIAOpenAI(cliente, config);
}
