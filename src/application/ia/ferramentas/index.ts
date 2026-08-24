/**
 * Registro de execução das ferramentas (D2).
 *
 * Ponto único por onde toda chamada de ferramenta passa. Ele é quem transforma
 * as três formas de dar errado em RETORNO LEGÍVEL, nunca em exceção — se uma
 * delas escapasse, mataria o loop do agente no meio de uma resposta:
 *
 *   1. o modelo pede uma ferramenta que não existe;
 *   2. os argumentos não batem com o schema declarado;
 *   3. o caso de uso lança (ex.: `ConfigAusenteError`).
 *
 * A validação acontece de novo aqui, com o MESMO schema do catálogo que o
 * adapter usou. É de propósito: o wrapper recebe `unknown` do loop, e confiar
 * que alguém já validou é como o dado errado entra.
 */
import { ZodError } from 'zod';
import type { Deps } from '@/application/deps';
import { CATALOGO_FERRAMENTAS } from './catalogo';
import { erroFerramenta, type SaidaFerramenta } from './saida';
import { estadoCiclo, gastosPorCategoria, pagamentosPendentes, situacaoHoje } from './situacao';
import { analiseCorte, assinaturasDetectadas } from './analise';
import { paraOndeVaiARenda } from './renda';
import { patrimonioResumo } from './patrimonio';
import {
  projetarCiclosFerramenta,
  simularCompraParcelada,
  simularMetaPrazoFerramenta,
  simularRendaFerramenta,
} from './projecao';
import {
  buscarMemoriaFerramenta,
  opcoesDeLancamento,
  proporLancamento,
  proporMemoria,
  proporParcelamento,
} from './escrita';

/** Recebe os argumentos JÁ validados pelo schema da ferramenta. */
type Executor = (deps: Deps, argumentos: never) => Promise<SaidaFerramenta>;

/**
 * Mapa nome -> implementação. Todo nome do catálogo precisa estar aqui, e
 * vice-versa — um teste da D6 prova a bijeção, para que ferramenta declarada
 * e não implementada não chegue ao modelo.
 */
const EXECUTORES: Record<string, Executor> = {
  situacao_hoje: situacaoHoje as Executor,
  estado_ciclo: estadoCiclo as Executor,
  gastos_por_categoria: gastosPorCategoria as Executor,
  pagamentos_pendentes: pagamentosPendentes as Executor,
  para_onde_vai_a_renda: paraOndeVaiARenda as Executor,
  analise_corte: analiseCorte as Executor,
  assinaturas_detectadas: assinaturasDetectadas as Executor,
  patrimonio_resumo: patrimonioResumo as Executor,
  projetar_ciclos: projetarCiclosFerramenta as Executor,
  simular_compra_parcelada: simularCompraParcelada as Executor,
  simular_meta_prazo: simularMetaPrazoFerramenta as Executor,
  simular_renda: simularRendaFerramenta as Executor,
  // Propostas (D-8) e memória (Fase E). Nenhuma delas grava — ver escrita.ts.
  opcoes_de_lancamento: opcoesDeLancamento as Executor,
  propor_lancamento: proporLancamento as Executor,
  propor_parcelamento: proporParcelamento as Executor,
  buscar_memoria: buscarMemoriaFerramenta as Executor,
  propor_memoria: proporMemoria as Executor,
};

export const NOMES_DE_FERRAMENTA = Object.keys(EXECUTORES);

/**
 * Executa uma ferramenta pedida pelo modelo. NUNCA lança: toda falha vira
 * `{ erro }`, para o agente poder narrar o problema em vez de morrer.
 */
export async function executarFerramenta(
  deps: Deps,
  nome: string,
  argumentos: unknown,
): Promise<SaidaFerramenta> {
  const definicao = CATALOGO_FERRAMENTAS.find((f) => f.nome === nome);
  const executor = EXECUTORES[nome];

  if (!definicao || !executor) {
    return erroFerramenta(
      `Ferramenta desconhecida: "${nome}". Disponíveis: ${NOMES_DE_FERRAMENTA.join(', ')}.`,
    );
  }

  const validado = definicao.argumentos.safeParse(argumentos);
  if (!validado.success) {
    return erroFerramenta(`Argumentos inválidos para "${nome}": ${mensagemDeErro(validado.error)}`);
  }

  try {
    return await executor(deps, validado.data as never);
  } catch (erro) {
    return erroFerramenta(
      `Não consegui obter esse dado (${nome}): ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
}

function mensagemDeErro(erro: ZodError): string {
  return erro.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`).join('; ');
}
