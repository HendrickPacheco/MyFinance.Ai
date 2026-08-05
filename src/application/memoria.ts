/**
 * Casos de uso da memória do copiloto (Fase E, tarefa E5).
 *
 * Três invariantes que este arquivo existe para manter, e que nenhuma camada
 * acima consegue manter sozinha:
 *
 *  1. **Número nunca entra.** Toda gravação passa por `validarTextoMemoria`
 *     (função pura, domain/memoria/regras.ts) ANTES do embedding e antes do
 *     banco. Validar depois de vetorizar já teria gasto dinheiro para guardar
 *     algo que será recusado.
 *
 *  2. **Memória é OWNER-only** (decisão D-12, 04/08/2026). VIEWER não lê nem
 *     escreve: memória contém plano e contexto de vida, mais sensível que os
 *     números que o VIEWER já enxerga. Por isso `exigirOwner` — e não
 *     `exigirEscrita` — inclusive nas LEITURAS.
 *
 *  3. **Embedding gasta dinheiro real**, então é uma entrada de IA e obedece
 *     ao contrato de três passos de `limite-ia.ts` (§10.2 item 3): OWNER,
 *     teto avaliado antes, consumo registrado depois.
 *
 * Degradação deliberada: se o embedding falhar, a memória é gravada mesmo
 * assim, sem vetor. O dono não perde o que pediu para guardar; ela só não é
 * alcançada pela busca semântica. Perder a memória seria pior que perder a
 * busca.
 */
import type { Deps } from './deps';
import { exigirOwner } from '@/domain/auth/permissoes';
import { avaliarLimiteIA } from './limite-ia';
import { validarTextoMemoria, type TipoMemoria } from '@/domain/memoria/regras';
import type { Memoria, MemoriaComRelevancia } from '@/domain/ports/memoria';
import type { ConsumoTokens } from '@/domain/ports/ia';

/** Recusa de gravação por violar a guarda pura. Traduzida em texto pela action. */
export class MemoriaInvalidaError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = 'MemoriaInvalidaError';
  }
}

export class MemoriaIndisponivelError extends Error {
  constructor() {
    super('A memória do copiloto não está disponível nesta instalação.');
    this.name = 'MemoriaIndisponivelError';
  }
}

export interface SalvarMemoriaInput {
  tipo: TipoMemoria;
  texto: string;
  /** `COPILOTO` = proposta que o dono confirmou na tela; `USUARIO` = digitada. */
  origem?: 'USUARIO' | 'COPILOTO';
}

/**
 * Gera o vetor cobrando do teto diário. Devolve `null` — e NÃO lança — quando
 * embedding está desligado, o teto estourou ou o provedor falhou: nos três
 * casos a memória ainda deve ser gravada.
 */
async function vetorizarSeMePermitirem(
  deps: Deps,
  texto: string,
): Promise<readonly number[] | null> {
  if (!deps.embeddings) return null;

  const hoje = deps.relogio.hoje();

  if (deps.usoIA) {
    const veredicto = avaliarLimiteIA(await deps.usoIA.doDia(hoje));
    // Teto estourado não impede guardar a intenção — impede gastar por ela.
    if (!veredicto.permitido) return null;
  }

  let consumo: ConsumoTokens | undefined;
  try {
    const resultado = await deps.embeddings.gerar(texto);
    consumo = resultado.consumo;
    return resultado.vetor;
  } catch {
    // Degradação silenciosa por decisão: ver o cabeçalho deste arquivo.
    return null;
  } finally {
    if (consumo && deps.usoIA) {
      try {
        await deps.usoIA.incrementar(hoje, {
          requisicoes: 1,
          tokensEntrada: consumo.entrada,
          tokensSaida: consumo.saida,
        });
      } catch {
        // Contador indisponível não desfaz uma chamada já paga nem justifica
        // perder a memória.
      }
    }
  }
}

export async function salvarMemoria(deps: Deps, input: SalvarMemoriaInput): Promise<Memoria> {
  // Passo 1 do contrato, e a decisão D-12: primeira linha, antes de qualquer I/O.
  exigirOwner(deps.ator);
  if (!deps.memorias) throw new MemoriaIndisponivelError();

  // A guarda pura vem ANTES do embedding: recusar depois de vetorizar seria
  // pagar para descobrir que o texto não podia ser guardado.
  const validado = validarTextoMemoria(input.texto);
  if (!validado.ok) throw new MemoriaInvalidaError(validado.motivo);

  const embedding = await vetorizarSeMePermitirem(deps, validado.texto);

  return deps.memorias.criar({
    tipo: input.tipo,
    texto: validado.texto,
    origem: input.origem ?? 'USUARIO',
    embedding,
  });
}

export async function listarMemorias(
  deps: Deps,
  opcoes?: { tipos?: readonly TipoMemoria[]; incluirArquivadas?: boolean },
): Promise<Memoria[]> {
  exigirOwner(deps.ator);
  if (!deps.memorias) return [];
  return deps.memorias.listar(opcoes);
}

/**
 * Busca semântica. Sem embedding configurado devolve as memórias mais recentes
 * em vez de lista vazia: o copiloto continua com contexto, só perde a
 * priorização por relevância. Degradar é melhor que ficar cego.
 */
export async function buscarMemoria(
  deps: Deps,
  consulta: string,
  opcoes?: { limite?: number; tipos?: readonly TipoMemoria[] },
): Promise<MemoriaComRelevancia[]> {
  exigirOwner(deps.ator);
  if (!deps.memorias) return [];

  const vetor = await vetorizarSeMePermitirem(deps, consulta);
  if (!vetor) {
    const recentes = await deps.memorias.listar({
      tipos: opcoes?.tipos,
      limite: opcoes?.limite,
    });
    // `distancia: null` seria mentira menor, mas o tipo pede número. NaN
    // sinaliza honestamente "não houve comparação vetorial aqui".
    return recentes.map((m) => ({ ...m, distancia: Number.NaN }));
  }

  return deps.memorias.buscarPorEmbedding(vetor, opcoes);
}

/**
 * Reindexa as memórias que estão sem vetor (Fase E, fecha o ciclo da E8).
 *
 * Necessária porque o backup não carrega o vetor: sem isto, restaurar um
 * backup deixaria a busca semântica permanentemente cega para as memórias
 * antigas, e o dono não teria como perceber nem como corrigir.
 *
 * Para o teto diário de custo cada memória é uma chamada, avaliada dentro de
 * `vetorizarSeMePermitirem` — quando o teto estoura, a reindexação simplesmente
 * para onde está e devolve quantas conseguiu. Rodar de novo amanhã continua de
 * onde parou, porque o critério é "ainda está sem vetor".
 */
export async function reindexarMemorias(
  deps: Deps,
  limite = 100,
): Promise<{ reindexadas: number; restantes: number }> {
  exigirOwner(deps.ator);
  if (!deps.memorias) throw new MemoriaIndisponivelError();
  if (!deps.embeddings) return { reindexadas: 0, restantes: 0 };

  const pendentes = await deps.memorias.listarSemEmbedding(limite);

  let reindexadas = 0;
  for (const memoria of pendentes) {
    const vetor = await vetorizarSeMePermitirem(deps, memoria.texto);
    // Teto estourado ou provedor fora do ar: para aqui em vez de gastar o
    // resto da fila tentando. O que ficou continua pendente para a próxima.
    if (!vetor) break;

    await deps.memorias.definirEmbedding(memoria.id, vetor);
    reindexadas += 1;
  }

  return { reindexadas, restantes: pendentes.length - reindexadas };
}

export async function arquivarMemoria(deps: Deps, id: string): Promise<void> {
  exigirOwner(deps.ator);
  if (!deps.memorias) throw new MemoriaIndisponivelError();
  await deps.memorias.arquivar(id);
}

export async function reativarMemoria(deps: Deps, id: string): Promise<void> {
  exigirOwner(deps.ator);
  if (!deps.memorias) throw new MemoriaIndisponivelError();
  await deps.memorias.reativar(id);
}
