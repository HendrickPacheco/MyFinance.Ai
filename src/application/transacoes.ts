/**
 * Casos de uso de transações (SPEC 8 e regras 1–5, 9). Regras de negócio
 * críticas: competência na data da compra, TRANSFERENCIA nunca é gasto,
 * estorno abate na data original, parcelamento por competência mensal, e
 * edição retroativa de ciclo fechado exige confirmação explícita e recalcula
 * a sobra daquele ciclo (SPEC regra 9) — sem isso a corrupção é silenciosa.
 */
import type { Deps } from './deps';
import type { Ciclo, Transacao } from '@/domain/model/entidades';
import type { TipoTransacao, MetodoPagamento } from '@/domain/model/enums';
import { gerarParcelas, sobraCiclo } from '@/domain/finance';
import { indexarGrupoCategoria, paraCalculo } from './mapeamento';

export interface TransacaoInput {
  valorCents: number;
  categoriaId?: string | null;
  tipo?: TipoTransacao;
  data?: string; // default: hoje
  descricao?: string | null;
  metodo?: MetodoPagamento | null;
  contaId?: string | null;
  contaDestinoId?: string | null;
  provisaoId?: string | null;
  /**
   * Confirmação explícita (SPEC regra 9) exigida quando a operação toca um
   * ciclo já fechado — seja porque a transação pertence a ele, seja porque a
   * mudança de data a move para dentro ou para fora dele. Sem este flag a
   * operação é recusada com `CicloFechadoError`.
   */
  confirmarRetroativo?: boolean;
}

export interface ParcelamentoInput {
  descricao: string;
  valorTotalCents: number;
  numParcelas: number;
  dataCompra?: string; // default: hoje
  categoriaId?: string | null;
  contaId?: string | null;
  metodo?: MetodoPagamento | null;
}

/**
 * Erro tipado e discriminável (SPEC regra 9): sinaliza que a operação foi
 * recusada por tocar um ciclo fechado sem confirmação. A camada de server
 * action reconhece este erro por `instanceof` e traduz em pedido de
 * confirmação para a UI — nunca deixa vazar como exceção genérica.
 */
export class CicloFechadoError extends Error {
  constructor(public readonly ciclosAfetados: readonly string[]) {
    super(
      'Esta transação pertence a um ciclo já fechado. Confirme para recalcular a sobra desse ciclo.',
    );
    this.name = 'CicloFechadoError';
  }
}

/** Efeito de uma transação sobre o saldo dos buckets. sinal +1 aplica, -1 reverte. */
async function aplicarEfeitoSaldo(deps: Deps, t: Transacao, sinal: 1 | -1): Promise<void> {
  const v = t.valorCents * sinal;
  switch (t.tipo) {
    case 'DESPESA':
      if (t.contaId) await deps.contas.ajustarSaldo(t.contaId, -v);
      break;
    case 'RENDA':
    case 'ESTORNO':
      if (t.contaId) await deps.contas.ajustarSaldo(t.contaId, +v);
      break;
    case 'TRANSFERENCIA':
      if (t.contaId) await deps.contas.ajustarSaldo(t.contaId, -v);
      if (t.contaDestinoId) await deps.contas.ajustarSaldo(t.contaDestinoId, +v);
      break;
  }
}

/**
 * Efeito de um gasto de provisão sobre o acumulado da provisão. sinal +1
 * abate (gasto novo), sinal -1 devolve (reversão). Só DESPESA marcada com
 * provisaoId mexe no acumulado — e nunca consome verba (item 3 / regra 8).
 */
async function aplicarEfeitoProvisao(deps: Deps, t: Transacao, sinal: 1 | -1): Promise<void> {
  if (t.provisaoId && t.tipo === 'DESPESA') {
    await deps.provisoes.ajustarAcumulado(t.provisaoId, -t.valorCents * sinal);
  }
}

async function resolverCicloId(deps: Deps, data: string): Promise<string | null> {
  const ciclo = await deps.ciclos.obterAtual(data);
  return ciclo?.id ?? null;
}

/** Ciclos únicos, já fechados, dentre os ids informados (ignora nulos e repetidos). */
async function ciclosFechadosEntre(
  deps: Deps,
  cicloIds: readonly (string | null)[],
): Promise<Ciclo[]> {
  const idsUnicos = [...new Set(cicloIds.filter((id): id is string => id != null))];
  const ciclos = await Promise.all(idsUnicos.map((id) => deps.ciclos.obter(id)));
  return ciclos.filter((c): c is Ciclo => c != null && c.fechado);
}

/**
 * Guarda de retroatividade (SPEC regra 9): se algum dos ciclos envolvidos na
 * operação (o de origem e/ou o de destino, quando a data muda) já está
 * fechado, exige `confirmarRetroativo`. Devolve os ciclos fechados
 * envolvidos, para recálculo de sobra após a operação.
 */
async function exigirConfirmacaoSeRetroativo(
  deps: Deps,
  cicloIds: readonly (string | null)[],
  confirmarRetroativo: boolean,
): Promise<Ciclo[]> {
  const fechados = await ciclosFechadosEntre(deps, cicloIds);
  if (fechados.length > 0 && !confirmarRetroativo) {
    throw new CicloFechadoError(fechados.map((c) => c.id));
  }
  return fechados;
}

/**
 * Recalcula e persiste `sobraCents` de um ciclo fechado a partir do estado
 * atual das transações (SPEC regra 9). Reaproveita a mesma fórmula pura do
 * fechamento (`sobraCiclo`, em `src/domain/finance`) — nunca reimplementa.
 */
async function recalcularSobraCicloFechado(deps: Deps, cicloId: string): Promise<void> {
  const ciclo = await deps.ciclos.obter(cicloId);
  if (!ciclo) return;

  const [transacoes, categorias] = await Promise.all([
    deps.transacoes.listarPorCiclo(cicloId),
    deps.categorias.listar(),
  ]);
  const grupos = indexarGrupoCategoria(categorias);
  const { sobraCents } = sobraCiclo({
    verbaVariavelCents: ciclo.verbaVariavelCents,
    dataFimCiclo: ciclo.dataFim,
    transacoes: paraCalculo(transacoes, grupos),
  });

  await deps.ciclos.atualizar(cicloId, { sobraCents });
}

async function recalcularSobraDosCiclosFechados(
  deps: Deps,
  ciclosFechados: readonly Ciclo[],
): Promise<void> {
  for (const ciclo of ciclosFechados) {
    await recalcularSobraCicloFechado(deps, ciclo.id);
  }
}

export async function criarTransacao(deps: Deps, input: TransacaoInput): Promise<Transacao> {
  const data = input.data ?? deps.relogio.hoje();
  const cicloId = await resolverCicloId(deps, data);

  const t = await deps.transacoes.criar({
    id: '',
    data,
    valorCents: input.valorCents,
    tipo: input.tipo ?? 'DESPESA',
    descricao: input.descricao ?? null,
    metodo: input.metodo ?? null,
    categoriaId: input.categoriaId ?? null,
    contaId: input.contaId ?? null,
    contaDestinoId: input.contaDestinoId ?? null,
    provisaoId: input.provisaoId ?? null,
    parcelamentoId: null,
    parcelaNum: null,
    estornoDeId: null,
    cicloId,
    pagoEm: null,
  });

  await aplicarEfeitoSaldo(deps, t, +1);
  await aplicarEfeitoProvisao(deps, t, +1);
  return t;
}

export async function criarParcelamento(deps: Deps, input: ParcelamentoInput): Promise<Transacao[]> {
  const dataCompra = input.dataCompra ?? deps.relogio.hoje();

  const parcelamento = await deps.parcelamentos.criar({
    id: '',
    descricao: input.descricao,
    valorTotalCents: input.valorTotalCents,
    numParcelas: input.numParcelas,
    dataCompra,
    categoriaId: input.categoriaId ?? null,
  });

  const parcelas = gerarParcelas({
    valorTotalCents: input.valorTotalCents,
    numParcelas: input.numParcelas,
    dataCompra,
  });

  const transacoes: Transacao[] = [];
  for (const p of parcelas) {
    transacoes.push({
      id: '',
      data: p.data,
      valorCents: p.valorCents,
      tipo: 'DESPESA',
      descricao: `${input.descricao} (${p.parcelaNum}/${input.numParcelas})`,
      metodo: input.metodo ?? 'CREDITO',
      categoriaId: input.categoriaId ?? null,
      contaId: null,
      contaDestinoId: null,
      provisaoId: null,
      parcelamentoId: parcelamento.id,
      parcelaNum: p.parcelaNum,
      estornoDeId: null,
      cicloId: await resolverCicloId(deps, p.data),
      pagoEm: null,
    });
  }
  return deps.transacoes.criarVarias(transacoes);
}

export async function editarTransacao(
  deps: Deps,
  id: string,
  input: TransacaoInput,
): Promise<Transacao> {
  const atual = await deps.transacoes.obter(id);
  if (!atual) throw new Error('Transação não encontrada.');

  // `undefined` = campo não enviado (preserva); `null` = limpar de propósito.
  const manter = <T>(entrada: T | undefined, atualValor: T): T =>
    entrada !== undefined ? entrada : atualValor;

  const data = manter(input.data, atual.data);
  const novoCicloId = await resolverCicloId(deps, data);

  // Guarda (SPEC regra 9): tanto o ciclo de origem quanto o de destino (se a
  // data mudar de ciclo) entram na checagem de retroatividade.
  const ciclosFechados = await exigirConfirmacaoSeRetroativo(
    deps,
    [atual.cicloId, novoCicloId],
    input.confirmarRetroativo ?? false,
  );

  // Reverte os efeitos antigos (saldo e provisão) antes de reescrever.
  await aplicarEfeitoSaldo(deps, atual, -1);
  await aplicarEfeitoProvisao(deps, atual, -1);

  const patch: Partial<Transacao> = {
    data,
    valorCents: input.valorCents,
    tipo: manter(input.tipo, atual.tipo),
    descricao: manter(input.descricao, atual.descricao),
    metodo: manter(input.metodo, atual.metodo),
    categoriaId: manter(input.categoriaId, atual.categoriaId),
    contaId: manter(input.contaId, atual.contaId),
    contaDestinoId: manter(input.contaDestinoId, atual.contaDestinoId),
    provisaoId: manter(input.provisaoId, atual.provisaoId),
    cicloId: novoCicloId,
  };

  const novo = await deps.transacoes.atualizar(id, patch);
  await aplicarEfeitoSaldo(deps, novo, +1);
  await aplicarEfeitoProvisao(deps, novo, +1);

  await recalcularSobraDosCiclosFechados(deps, ciclosFechados);
  return novo;
}

export async function excluirTransacao(
  deps: Deps,
  id: string,
  confirmarRetroativo = false,
): Promise<void> {
  const atual = await deps.transacoes.obter(id);
  if (!atual) return;

  const ciclosFechados = await exigirConfirmacaoSeRetroativo(
    deps,
    [atual.cicloId],
    confirmarRetroativo,
  );

  await aplicarEfeitoSaldo(deps, atual, -1);
  await aplicarEfeitoProvisao(deps, atual, -1);
  await deps.transacoes.excluir(id);

  await recalcularSobraDosCiclosFechados(deps, ciclosFechados);
}

/**
 * Estorno (regra 5): abate na data da transação original quando ela existe.
 * Cria uma transação ESTORNO ligada à original. Regra 9: se a transação
 * original pertence a um ciclo fechado, ou se o estorno cai (por data) dentro
 * de um ciclo fechado, exige confirmação e recalcula a sobra de cada um.
 */
export async function estornarTransacao(
  deps: Deps,
  id: string,
  valorCents?: number,
  data?: string,
  confirmarRetroativo = false,
): Promise<Transacao> {
  const original = await deps.transacoes.obter(id);

  const valor = valorCents ?? original?.valorCents ?? 0;
  const dataEstorno = data ?? original?.data ?? deps.relogio.hoje();
  const cicloDestinoId = await resolverCicloId(deps, dataEstorno);

  const ciclosFechados = await exigirConfirmacaoSeRetroativo(
    deps,
    [original?.cicloId ?? null, cicloDestinoId],
    confirmarRetroativo,
  );

  const estorno = await deps.transacoes.criar({
    id: '',
    data: dataEstorno,
    valorCents: valor,
    tipo: 'ESTORNO',
    descricao: original ? `Estorno: ${original.descricao ?? 'transação'}` : 'Estorno',
    metodo: original?.metodo ?? null,
    categoriaId: original?.categoriaId ?? null,
    contaId: original?.contaId ?? null,
    contaDestinoId: null,
    provisaoId: original?.provisaoId ?? null,
    parcelamentoId: null,
    parcelaNum: null,
    estornoDeId: id,
    cicloId: cicloDestinoId,
    pagoEm: null,
  });

  await aplicarEfeitoSaldo(deps, estorno, +1);

  // Estorno de um gasto de provisão devolve o valor ao acumulado da provisão.
  if (original?.provisaoId && original.tipo === 'DESPESA') {
    await deps.provisoes.ajustarAcumulado(original.provisaoId, +valor);
  }

  await recalcularSobraDosCiclosFechados(deps, ciclosFechados);
  return estorno;
}
