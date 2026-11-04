/**
 * Consulta filtrada de transações — `GET /agent/v1/transacoes`. A filtragem
 * de verdade mora NO BANCO (`TransacaoRepository.listarFiltrado`, dono
 * exclusivo em `prisma-repositories.ts`); este módulo só traduz a query da
 * rota (strings/números já validados pelo zod) para `FiltroTransacoes`, e
 * essa tradução é PURA — testável sem banco (ver `consulta-transacoes.test.ts`).
 */
import type { Deps } from './deps';
import type {
  FiltroTransacoes,
  PaginaTransacoes,
} from '@/domain/ports/repositorios';
import type { TipoTransacao, MetodoPagamento } from '@/domain/model/enums';
import type { OrigemTransacao } from '@/domain/model/entidades';
import type { DataCivil } from '@/shared/data';

/**
 * Saída de `listarTransacoesQuerySchema` (`src/agent-api/schemas/transacoes.ts`)
 * — já validada e com defaults aplicados pelo zod (`ordem`/`direcao`/`limite`
 * sempre presentes no OUTPUT do schema).
 */
export interface ConsultaTransacoesInput {
  de?: DataCivil;
  ate?: DataCivil;
  tipo?: TipoTransacao;
  metodo?: MetodoPagamento;
  categoriaId?: string;
  contaId?: string;
  cicloId?: string;
  texto?: string;
  valorMin?: number;
  valorMax?: number;
  parcelamentoId?: string;
  origem?: OrigemTransacao;
  ordem: 'data' | 'valor';
  direcao: 'asc' | 'desc';
  cursor?: string;
  limite: number;
}

/**
 * Mapeamento puro query -> filtro de repositório. `valorMin`/`valorMax`
 * (vocabulário HTTP, camelCase sem `Cents` no nome do parâmetro — mais curto
 * na URL) tornam-se `valorMinCents`/`valorMaxCents` (vocabulário do domínio,
 * regra 1 do CLAUDE.md: toda variável monetária termina em `Cents`).
 */
export function construirFiltroTransacoes(input: ConsultaTransacoesInput): FiltroTransacoes {
  return {
    de: input.de,
    ate: input.ate,
    tipo: input.tipo,
    metodo: input.metodo,
    categoriaId: input.categoriaId,
    contaId: input.contaId,
    cicloId: input.cicloId,
    texto: input.texto,
    valorMinCents: input.valorMin,
    valorMaxCents: input.valorMax,
    parcelamentoId: input.parcelamentoId,
    origem: input.origem,
    ordem: input.ordem,
    direcao: input.direcao,
    cursor: input.cursor,
    limite: input.limite,
  };
}

export async function listarTransacoesFiltradas(
  deps: Deps,
  input: ConsultaTransacoesInput,
): Promise<PaginaTransacoes> {
  return deps.transacoes.listarFiltrado(construirFiltroTransacoes(input));
}
