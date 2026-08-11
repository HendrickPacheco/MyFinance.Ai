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
  divergenciasConciliacao,
  type DivergenciaConciliacao,
} from '@/domain/finance';
import { indexarGrupoCategoria, paraCalculo } from './mapeamento';

export interface PontoCurva {
  data: string;
  totalCents: number;
}

/**
 * Por que `mesesDeReserva` veio `null`. Existe para que quem consome o
 * read-model — em especial o copiloto — informe a razão em vez de inventar
 * uma: um booleano mudo ("desconhecido: true") faz o modelo preencher a
 * lacuna com a explicação mais plausível, que já saiu errada em produção.
 */
export type MotivoMesesDesconhecido = 'SEM_CICLO_FECHADO' | 'CUSTO_NAO_POSITIVO';

export interface EstadoPatrimonio {
  snapshots: SnapshotPatrimonio[];
  curva: PontoCurva[];
  totalAtualCents: number;
  variacaoMensalCents: number;
  taxaAcumulacaoMediaCents: number;
  /** `null` quando ainda não há histórico de ciclos fechados para conhecer o custo mensal médio. */
  mesesDeReserva: number | null;
  /** Preenchido exatamente quando `mesesDeReserva` é `null`. */
  motivoMesesDesconhecido: MotivoMesesDesconhecido | null;
  /**
   * Custo mensal COMPROMETIDO: fixos + provisão. Diferente de `custoMensalMedio`,
   * não depende de histórico — são valores congelados na Config, conhecidos desde
   * o primeiro dia. É o que permite responder "a reserva cobre meus fixos?" antes
   * de existir qualquer ciclo fechado.
   */
  custoComprometidoMensalCents: number;
  /**
   * Cobertura da reserva contra o custo comprometido. É um PISO da autonomia
   * real (ignora o variável, que só o histórico revela), nunca a resposta final
   * de `mesesDeReserva`.
   */
  mesesDeReservaComprometidos: number | null;
  /** Saldo das contas tipo RESERVA — numerador de ambas as coberturas. */
  saldoReservaCents: number;
  /**
   * Itens do último snapshot cujo valor observado discorda do saldo da conta
   * que eles fotografam. Lista vazia = razão e realidade batem.
   */
  divergencias: DivergenciaConciliacao[];
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

  // Uma leitura só de contas: alimenta o saldo de reserva e a conciliação.
  const [custoMensalMedioCents, custoComprometidoMensalCents, contas] = await Promise.all([
    custoMensalMedio(deps),
    custoComprometidoMensal(deps),
    deps.contas.listar({ incluirArquivadas: false }),
  ]);

  const saldoReservaCents = contas
    .filter((c) => c.tipo === 'RESERVA')
    .reduce((s, c) => s + c.saldoCents, 0);

  const meses = mesesDeReserva({ saldoReservaCents, custoMensalMedioCents });

  // Concilia contra o snapshot MAIS RECENTE — é a única fotografia que ainda
  // descreve o presente; divergência de um snapshot antigo é história, não
  // pendência.
  const maisRecente = cronologicos.at(-1);
  const divergencias = maisRecente
    ? divergenciasConciliacao(
        maisRecente.itens,
        new Map(contas.map((c) => [c.id, c.saldoCents])),
      )
    : [];

  return {
    snapshots: cronologicos.reverse(),
    curva,
    totalAtualCents,
    variacaoMensalCents: variacaoMensalCents(totalAtualCents, anteriorCents),
    taxaAcumulacaoMediaCents: taxaAcumulacaoMediaCents(totais),
    mesesDeReserva: meses,
    motivoMesesDesconhecido:
      meses !== null ? null : custoMensalMedioCents === null ? 'SEM_CICLO_FECHADO' : 'CUSTO_NAO_POSITIVO',
    custoComprometidoMensalCents,
    mesesDeReservaComprometidos: mesesDeReserva({
      saldoReservaCents,
      custoMensalMedioCents: custoComprometidoMensalCents,
    }),
    saldoReservaCents,
    divergencias,
    temDados: snapshots.length > 0,
  };
}

/**
 * Custo mensal comprometido: fixos ativos + provisão mensal. Sem média, sem
 * histórico, sem ciclo fechado — só o que já está congelado na Config. Serve de
 * divisor honesto para a cobertura mínima da reserva enquanto o custo variável
 * ainda é desconhecido (ver `mesesDeReservaComprometidos`).
 */
export async function custoComprometidoMensal(deps: Deps): Promise<number> {
  const [custos, provisoes] = await Promise.all([
    deps.custosFixos.listarAtivos(),
    deps.provisoes.listarAtivas(),
  ]);

  const fixos = custos.reduce((s, c) => s + c.valorCents, 0);
  return fixos + provisaoMensalCents(provisoes.map((p) => p.valorAnualCents));
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

/**
 * Aceita a realidade observada: move `Conta.saldoCents` até o valor que o
 * snapshot registrou, zerando a divergência daquele item.
 *
 * Ajusta o saldo direto, SEM criar `Transacao`. Uma transação de despesa
 * consumiria o teto diário e apareceria na análise por categoria — a diferença
 * entre razão e realidade não é um gasto de hoje, é correção de um registro que
 * ficou para trás. `Conta.saldoCents` não entra no cálculo da verba (verba vem
 * de renda − poupança − fixos − provisão), então mexer nele não distorce teto.
 *
 * Recalcula o delta a partir do estado atual em vez de confiar num valor vindo
 * da tela: entre o render e o clique o saldo pode ter mudado, e aplicar um
 * delta velho gravaria um saldo que nunca foi verdade.
 */
export async function aceitarRealidade(deps: Deps, itemId: string): Promise<void> {
  exigirEscrita(deps.ator);

  const snapshot = await deps.patrimonio.ultimoSnapshot();
  const item = snapshot?.itens.find((i) => i.id === itemId);
  if (!item || item.contaId === null) {
    throw new Error('Item de patrimônio não encontrado ou sem conta vinculada.');
  }

  // `listar` já vem escopado no dono (composition.ts), então uma conta de
  // outro usuário simplesmente não aparece aqui.
  const contas = await deps.contas.listar({ incluirArquivadas: false });
  const conta = contas.find((c) => c.id === item.contaId);
  if (!conta) throw new Error('Conta vinculada não encontrada.');

  const deltaCents = item.valorCents - conta.saldoCents;
  if (deltaCents === 0) return;

  await deps.contas.ajustarSaldo(conta.id, deltaCents);
}

export interface ItemSnapshotInput {
  nome: string;
  classe: ClassePatrimonio;
  valorCents: number;
  /** Conta do razão que este item fotografa. `null`/ausente = item solto. */
  contaId?: string | null;
}

export async function criarSnapshot(
  deps: Deps,
  data: string,
  itens: ItemSnapshotInput[],
): Promise<SnapshotPatrimonio> {
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  exigirEscrita(deps.ator);

  // A FK do Postgres garante que a conta EXISTE, nunca que ela é deste dono —
  // um id alheio passaria pela constraint e ligaria o snapshot à conta de
  // outro usuário. `listar` já vem escopado, então validar contra ela é o
  // filtro de tenant (regra de ouro do multi-tenant, CLAUDE.md).
  const vinculados = itens.some((i) => i.contaId);
  const idsPermitidos = vinculados
    ? new Set((await deps.contas.listar({ incluirArquivadas: true })).map((c) => c.id))
    : new Set<string>();

  const itensEntidade: ItemPatrimonio[] = itens.map((i) => {
    if (i.contaId && !idsPermitidos.has(i.contaId)) {
      throw new Error('Conta vinculada inválida.');
    }
    return {
      id: '',
      snapshotId: '',
      nome: i.nome,
      classe: i.classe,
      valorCents: i.valorCents,
      contaId: i.contaId ?? null,
    };
  });

  const totalCents = totalPatrimonioCents(itens.map((i) => i.valorCents));
  return deps.patrimonio.salvar({ id: '', data, totalCents, itens: itensEntidade });
}

/** Pré-preenche o próximo snapshot com os itens do último (SPEC 8). */
export async function sugestaoItensSnapshot(deps: Deps): Promise<ItemSnapshotInput[]> {
  const ultimo = await deps.patrimonio.ultimoSnapshot();
  if (ultimo) {
    // Carrega o vínculo adiante: sem isso o snapshot do mês seguinte nasceria
    // solto e a conciliação se perderia a cada fotografia.
    return ultimo.itens.map((i) => ({
      nome: i.nome,
      classe: i.classe,
      valorCents: i.valorCents,
      contaId: i.contaId,
    }));
  }
  // Sem histórico: sugere os saldos das contas que entram no patrimônio, já
  // ligadas à conta de origem.
  const contas = await deps.contas.listar({ incluirArquivadas: false });
  return contas
    .filter((c) => c.incluiPatrimonio)
    .map((c) => ({
      nome: c.nome,
      classe: 'CONTA' as const,
      valorCents: c.saldoCents,
      contaId: c.id,
    }));
}
