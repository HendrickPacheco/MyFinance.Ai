/**
 * Casos de uso de transações (SPEC 8 e regras 1–5, 9). Regras de negócio
 * críticas: competência na data da compra, TRANSFERENCIA nunca é gasto,
 * estorno abate na data original, parcelamento por competência mensal, e
 * edição retroativa de ciclo fechado exige confirmação explícita e recalcula
 * a sobra daquele ciclo (SPEC regra 9) — sem isso a corrupção é silenciosa.
 */
import type { Deps } from './deps';
import { exigirEscrita } from '@/domain/auth/permissoes';
import type { Transacao } from '@/domain/model/entidades';
import type { TipoTransacao, MetodoPagamento } from '@/domain/model/enums';
import type { AjusteConta, AjusteProvisao } from '@/domain/ports/repositorios';
import { gerarParcelas } from '@/domain/finance';
import {
  exigirConfirmacaoSeRetroativo,
  recalcularSobraDosCiclosFechados,
} from './retroatividade';
import { validarCategoriaVariavel } from './categoria-parcela';

// Reexportada para não quebrar quem já importa `CicloFechadoError` daqui
// (actions e testes existentes) — a classe agora mora em `retroatividade.ts`
// junto com o resto da guarda de retroatividade (TASKS-CUSTOS Fase 5).
export { CicloFechadoError } from './retroatividade';

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
 * Efeitos de UMA transação sobre os buckets, como deltas — sem I/O.
 *
 * Função PURA de propósito (TASKS-CUSTOS §5.1 ticket 1): quem precisa aplicar
 * um lote inteiro numa única transação de banco (`aplicarLote`) tem que
 * SOMAR os efeitos antes de escrever, e para isso a regra de sinal por tipo
 * de transação precisa ser calculável sem tocar em repositório.
 * `aplicarEfeitoSaldo`/`aplicarEfeitoProvisao` passaram a ser só o aplicador
 * um-a-um desta mesma regra, para as duas nunca divergirem.
 *
 * sinal +1 aplica (lançamento novo), -1 reverte (exclusão/estorno).
 */
export function efeitosDe(
  t: Transacao,
  sinal: 1 | -1,
): { contas: AjusteConta[]; provisoes: AjusteProvisao[] } {
  const v = t.valorCents * sinal;
  const contas: AjusteConta[] = [];

  switch (t.tipo) {
    case 'DESPESA':
      if (t.contaId) contas.push({ contaId: t.contaId, deltaCents: -v });
      break;
    case 'RENDA':
    case 'ESTORNO':
      if (t.contaId) contas.push({ contaId: t.contaId, deltaCents: +v });
      break;
    case 'TRANSFERENCIA':
      if (t.contaId) contas.push({ contaId: t.contaId, deltaCents: -v });
      if (t.contaDestinoId) contas.push({ contaId: t.contaDestinoId, deltaCents: +v });
      break;
  }

  const provisoes: AjusteProvisao[] =
    t.provisaoId && t.tipo === 'DESPESA'
      ? [{ provisaoId: t.provisaoId, deltaCents: -t.valorCents * sinal }]
      : [];

  return { contas, provisoes };
}

/**
 * Soma os efeitos de VÁRIAS transações num único conjunto de deltas por conta
 * e por provisão — a entrada de `TransacaoRepository.aplicarLote`. Agregar
 * antes de escrever é o que permite a operação inteira caber em um
 * `$transaction`, em vez de N round-trips que podem falhar pela metade.
 */
export function somarEfeitos(
  entradas: readonly { transacao: Transacao; sinal: 1 | -1 }[],
): { ajustesConta: AjusteConta[]; ajustesProvisao: AjusteProvisao[] } {
  const porConta = new Map<string, number>();
  const porProvisao = new Map<string, number>();

  for (const { transacao, sinal } of entradas) {
    const efeitos = efeitosDe(transacao, sinal);
    for (const a of efeitos.contas) {
      porConta.set(a.contaId, (porConta.get(a.contaId) ?? 0) + a.deltaCents);
    }
    for (const a of efeitos.provisoes) {
      porProvisao.set(a.provisaoId, (porProvisao.get(a.provisaoId) ?? 0) + a.deltaCents);
    }
  }

  return {
    ajustesConta: [...porConta].map(([contaId, deltaCents]) => ({ contaId, deltaCents })),
    ajustesProvisao: [...porProvisao].map(([provisaoId, deltaCents]) => ({
      provisaoId,
      deltaCents,
    })),
  };
}

/**
 * Efeito de uma transação sobre o saldo dos buckets. sinal +1 aplica, -1
 * reverte. Exportada para `parcelamentos.ts` (TASKS-CUSTOS Fase 5) reusar o
 * mesmo caminho que `excluirTransacao` usa ao apagar parcelas.
 */
export async function aplicarEfeitoSaldo(deps: Deps, t: Transacao, sinal: 1 | -1): Promise<void> {
  for (const a of efeitosDe(t, sinal).contas) {
    await deps.contas.ajustarSaldo(a.contaId, a.deltaCents);
  }
}

/**
 * Efeito de um gasto de provisão sobre o acumulado da provisão. sinal +1
 * abate (gasto novo), sinal -1 devolve (reversão). Só DESPESA marcada com
 * provisaoId mexe no acumulado — e nunca consome verba (item 3 / regra 8).
 */
export async function aplicarEfeitoProvisao(deps: Deps, t: Transacao, sinal: 1 | -1): Promise<void> {
  for (const a of efeitosDe(t, sinal).provisoes) {
    await deps.provisoes.ajustarAcumulado(a.provisaoId, a.deltaCents);
  }
}

/**
 * Ciclo cuja janela (`dataInicio`..`dataFim`) cobre `data`, ou `null` se
 * nenhum ciclo nasceu ainda para essa competência. Exportada para
 * `parcelamentos.ts` resolver o `cicloId` das parcelas regeradas.
 */
export async function resolverCicloId(deps: Deps, data: string): Promise<string | null> {
  const ciclo = await deps.ciclos.obterAtual(data);
  return ciclo?.id ?? null;
}

export async function criarTransacao(deps: Deps, input: TransacaoInput): Promise<Transacao> {
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  exigirEscrita(deps.ator);

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
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  exigirEscrita(deps.ator);

  // D-11 na porta de entrada (TASKS-CUSTOS §5.1 ticket 6): nascer com
  // categoria FIXO/RENDA faria a parcela não contar em `gastoRealizadoCents`
  // — a mesma regra que `editarParcelamento` já protegia, furada na criação.
  // Antes de qualquer escrita, para não deixar cadastro órfão sem parcelas.
  await validarCategoriaVariavel(deps, input.categoriaId ?? null);

  const dataCompra = input.dataCompra ?? deps.relogio.hoje();

  const parcelamento = await deps.parcelamentos.criar({
    id: '',
    descricao: input.descricao,
    valorTotalCents: input.valorTotalCents,
    numParcelas: input.numParcelas,
    dataCompra,
    categoriaId: input.categoriaId ?? null,
    encerradoEm: null,
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
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  exigirEscrita(deps.ator);

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
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  exigirEscrita(deps.ator);

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
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  exigirEscrita(deps.ator);

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
