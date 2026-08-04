/**
 * Read-model e caso de uso de Patrimônio (SPEC 5.6, 7, 8).
 */
import type { Deps } from './deps';
import { exigirEscrita } from '@/domain/auth/permissoes';
import type { ItemPatrimonio, SnapshotPatrimonio } from '@/domain/model/entidades';
import type { ClassePatrimonio } from '@/domain/model/enums';
import {
  totalPatrimonioCents,
  variacaoMensalCents,
  taxaAcumulacaoMediaCents,
  mesesDeReserva,
  provisaoMensalCents,
  gastoRealizadoCents,
} from '@/domain/finance';
import { indexarGrupoCategoria, paraCalculo } from './mapeamento';

export interface PontoCurva {
  data: string;
  totalCents: number;
}

export interface EstadoPatrimonio {
  snapshots: SnapshotPatrimonio[];
  curva: PontoCurva[];
  totalAtualCents: number;
  variacaoMensalCents: number;
  taxaAcumulacaoMediaCents: number;
  /** `null` quando ainda não há histórico de ciclos fechados para conhecer o custo mensal médio. */
  mesesDeReserva: number | null;
  temDados: boolean;
}

export async function obterPatrimonio(deps: Deps): Promise<EstadoPatrimonio> {
  const snapshots = await deps.patrimonio.ultimosSnapshots(12);
  // Cronológico para a curva.
  const cronologicos = [...snapshots].sort((a, b) => a.data.localeCompare(b.data));
  const curva: PontoCurva[] = cronologicos.map((s) => ({ data: s.data, totalCents: s.totalCents }));
  const totais = cronologicos.map((s) => s.totalCents);

  const totalAtualCents = totais.at(-1) ?? 0;
  const anteriorCents = totais.at(-2) ?? 0;

  const custoMensalMedioCents = await custoMensalMedio(deps);
  const saldoReservaCents = await saldoContasReserva(deps);

  return {
    snapshots: cronologicos.reverse(),
    curva,
    totalAtualCents,
    variacaoMensalCents: variacaoMensalCents(totalAtualCents, anteriorCents),
    taxaAcumulacaoMediaCents: taxaAcumulacaoMediaCents(totais),
    mesesDeReserva: mesesDeReserva({ saldoReservaCents, custoMensalMedioCents }),
    temDados: snapshots.length > 0,
  };
}

/**
 * Custo mensal médio: fixos + provisão mensal + média da variável dos
 * últimos 3 ciclos FECHADOS. `null` quando ainda não há nenhum ciclo
 * fechado — sem esse histórico o custo variável é desconhecido, não zero,
 * e reportar um número aqui alimentaria `mesesDeReserva` com um divisor
 * fabricado (SPEC 13).
 */
export async function custoMensalMedio(deps: Deps): Promise<number | null> {
  const [custos, provisoes, ciclos, categorias] = await Promise.all([
    deps.custosFixos.listarAtivos(),
    deps.provisoes.listarAtivas(),
    deps.ciclos.ultimosFechados(3),
    deps.categorias.listar(),
  ]);

  if (ciclos.length === 0) return null;

  const fixos = custos.reduce((s, c) => s + c.valorCents, 0);
  const provisao = provisaoMensalCents(provisoes.map((p) => p.valorAnualCents));

  const grupos = indexarGrupoCategoria(categorias);
  const gastos = await Promise.all(
    ciclos.map(async (c) => {
      const txs = await deps.transacoes.listarPorCiclo(c.id);
      return gastoRealizadoCents(paraCalculo(txs, grupos), c.dataFim);
    }),
  );
  const mediaVariavel = Math.round(gastos.reduce((a, b) => a + b, 0) / ciclos.length);

  return fixos + provisao + mediaVariavel;
}

async function saldoContasReserva(deps: Deps): Promise<number> {
  const contas = await deps.contas.listar({ incluirArquivadas: false });
  return contas.filter((c) => c.tipo === 'RESERVA').reduce((s, c) => s + c.saldoCents, 0);
}

export interface ItemSnapshotInput {
  nome: string;
  classe: ClassePatrimonio;
  valorCents: number;
}

export async function criarSnapshot(
  deps: Deps,
  data: string,
  itens: ItemSnapshotInput[],
): Promise<SnapshotPatrimonio> {
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  exigirEscrita(deps.ator);

  const itensEntidade: ItemPatrimonio[] = itens.map((i) => ({
    id: '',
    snapshotId: '',
    nome: i.nome,
    classe: i.classe,
    valorCents: i.valorCents,
  }));
  const totalCents = totalPatrimonioCents(itens.map((i) => i.valorCents));
  return deps.patrimonio.criar({ id: '', data, totalCents, itens: itensEntidade });
}

/** Pré-preenche o próximo snapshot com os itens do último (SPEC 8). */
export async function sugestaoItensSnapshot(deps: Deps): Promise<ItemSnapshotInput[]> {
  const ultimo = await deps.patrimonio.ultimoSnapshot();
  if (ultimo) {
    return ultimo.itens.map((i) => ({ nome: i.nome, classe: i.classe, valorCents: i.valorCents }));
  }
  // Sem histórico: sugere os saldos das contas que entram no patrimônio.
  const contas = await deps.contas.listar({ incluirArquivadas: false });
  return contas
    .filter((c) => c.incluiPatrimonio)
    .map((c) => ({ nome: c.nome, classe: 'CONTA' as const, valorCents: c.saldoCents }));
}
