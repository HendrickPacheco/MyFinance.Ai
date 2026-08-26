/**
 * Testes de `desfazerImportacao` (I4 do `TASKS-IMPORTACAO.md`, §15.4/§15.5).
 * Fakes em memória, nunca banco. Espelha o mesmo fixture de `confirmar.test.ts`
 * (ciclo aberto + ciclo fechado, ator OWNER, "hoje" fixo) para os dois
 * conjuntos de testes ficarem comparáveis.
 *
 * Cada `it` prova um item da tabela do plano: "dinheiro sai por três
 * caminhos, e o desfazer reverte cada um pelo caminho que o criou".
 */
import { describe, it, expect } from 'vitest';
import {
  criarDeps as criarDepsFake,
  cicloFake,
  contaFake,
  transacaoFake,
  type FakeDeps,
} from '../__fakes__/fakes-ciclo-fechamento';
import type { CustoFixo } from '@/domain/model/entidades';
import type { NovaImportacao, NovoItemImportado } from '@/domain/ports/importacao';
import { confirmarItemImportado, ImportacaoInexistenteError } from './confirmar';
import { desfazerImportacao } from './desfazer';

const CICLO_ABERTO_ID = 'ciclo-aberto';
const CICLO_FECHADO_ID = 'ciclo-fechado';

function cicloAbertoFake() {
  return cicloFake({
    id: CICLO_ABERTO_ID,
    dataInicio: '2026-07-05',
    dataFim: '2026-08-04',
    fechado: false,
    fechadoEm: null,
    sobraCents: null,
  });
}

function cicloFechadoFake() {
  return cicloFake({
    id: CICLO_FECHADO_ID,
    dataInicio: '2026-06-05',
    dataFim: '2026-07-04',
    fechado: true,
    fechadoEm: '2026-07-05',
    sobraCents: 10_000,
  });
}

function custoFixoFake(patch: Partial<CustoFixo> = {}): CustoFixo {
  return {
    id: 'custo-luz',
    nome: 'Luz',
    valorCents: 25_000,
    diaVencimento: 10,
    ativo: true,
    contaId: null,
    categoriaId: null,
    vigenteDe: null,
    vigenteAte: null,
    ...patch,
  };
}

function itemBase(patch: Partial<NovoItemImportado> = {}): NovoItemImportado {
  return {
    ordem: 1,
    descricaoOriginal: 'COMPRA MERCADO',
    valorCents: 15_000,
    sinal: 'COMPRA',
    data: '2026-07-15',
    dataOriginalTexto: '15/07',
    parcelaAtual: null,
    parcelaTotal: null,
    confianca: 'ALTA',
    veredito: 'NOVA_AVULSA',
    vereditoMotivo: 'Não casou com nada existente.',
    alvoTipo: null,
    alvoId: null,
    chaveDedup: 'dedup-1',
    ...patch,
  };
}

async function seedImportacaoComItem(
  deps: FakeDeps,
  item: Partial<NovoItemImportado> = {},
): Promise<{ importacaoId: string; itemId: string }> {
  const dados: NovaImportacao = {
    origem: 'TEXTO_COLADO',
    nomeArquivo: null,
    hashConteudo: `hash-${Math.random()}`,
    competenciaRef: '2026-07',
    tokensEntrada: 100,
    tokensSaida: 50,
    itens: [itemBase(item)],
  };
  const criada = await deps.importacoes.criarRascunho(dados);
  const [primeiro] = criada.itens;
  if (!primeiro) throw new Error('seed sem item');
  return { importacaoId: criada.importacao.id, itemId: primeiro.id };
}

function fixture(): FakeDeps {
  return criarDepsFake({
    hoje: '2026-07-20',
    ciclos: [cicloAbertoFake(), cicloFechadoFake()],
  });
}

describe('desfazerImportacao — NOVA_AVULSA', () => {
  it('exclui a transação e devolve o saldo da conta', async () => {
    const deps = fixture();
    deps.contas.itens.push(contaFake({ id: 'conta-corrente', saldoCents: 100_000 }));
    const { importacaoId, itemId } = await seedImportacaoComItem(deps, {
      veredito: 'NOVA_AVULSA',
      valorCents: 15_000,
      data: '2026-07-15',
    });

    await confirmarItemImportado(deps, {
      importacaoId,
      itemId,
      ajustes: { contaId: 'conta-corrente' },
    });
    expect(deps.transacoes.itens).toHaveLength(1);
    expect(deps.contas.saldoDe('conta-corrente')).toBe(85_000);

    const resultado = await desfazerImportacao(deps, importacaoId);

    expect(resultado).toEqual({
      importacaoId,
      statusFinal: 'DESCARTADA',
      linhasRevertidas: 1,
      linhasNaoRevertidas: [],
    });
    expect(deps.transacoes.itens).toHaveLength(0);
    expect(deps.contas.saldoDe('conta-corrente')).toBe(100_000);

    const rascunho = await deps.importacoes.obter(importacaoId);
    expect(rascunho?.itens[0]?.decisao).toBe('PENDENTE');
    expect(rascunho?.importacao.status).toBe('DESCARTADA');
  });

  it('não toca nenhuma transação que não veio desta importação', async () => {
    const deps = fixture();
    deps.transacoes.itens.push(transacaoFake({ id: 'tx-alheia', origem: 'MANUAL' }));
    const { importacaoId, itemId } = await seedImportacaoComItem(deps, { veredito: 'NOVA_AVULSA' });
    await confirmarItemImportado(deps, { importacaoId, itemId });
    expect(deps.transacoes.itens).toHaveLength(2);

    await desfazerImportacao(deps, importacaoId);

    expect(deps.transacoes.itens).toHaveLength(1);
    expect(deps.transacoes.itens[0]?.id).toBe('tx-alheia');
  });

  it('desfazer duas vezes é inofensivo', async () => {
    const deps = fixture();
    const { importacaoId, itemId } = await seedImportacaoComItem(deps, { veredito: 'NOVA_AVULSA' });
    await confirmarItemImportado(deps, { importacaoId, itemId });

    const primeira = await desfazerImportacao(deps, importacaoId);
    const segunda = await desfazerImportacao(deps, importacaoId);

    expect(primeira.linhasRevertidas).toBe(1);
    expect(segunda).toEqual({
      importacaoId,
      statusFinal: 'DESCARTADA',
      linhasRevertidas: 0,
      linhasNaoRevertidas: [],
    });
    expect(deps.transacoes.itens).toHaveLength(0);
  });

  it('linha em ciclo fechado não é apagada sem confirmação explícita, e a mensagem diz por quê', async () => {
    const deps = fixture();
    const { importacaoId, itemId } = await seedImportacaoComItem(deps, {
      veredito: 'NOVA_AVULSA',
      data: '2026-06-10', // cai no ciclo fechado
    });
    await confirmarItemImportado(deps, { importacaoId, itemId, confirmarRetroativo: true });
    expect(deps.transacoes.itens).toHaveLength(1);

    const semConfirmar = await desfazerImportacao(deps, importacaoId);

    expect(semConfirmar.linhasRevertidas).toBe(0);
    expect(semConfirmar.linhasNaoRevertidas).toHaveLength(1);
    expect(semConfirmar.linhasNaoRevertidas[0]?.itemId).toBe(itemId);
    expect(semConfirmar.linhasNaoRevertidas[0]?.motivo).toMatch(/ciclo já fechado/);
    // A linha continua gravada — nada foi apagado.
    expect(deps.transacoes.itens).toHaveLength(1);
    const rascunho = await deps.importacoes.obter(importacaoId);
    expect(rascunho?.itens[0]?.decisao).toBe('GRAVADA');

    const comConfirmacao = await desfazerImportacao(deps, importacaoId, true);

    expect(comConfirmacao.linhasRevertidas).toBe(1);
    expect(comConfirmacao.linhasNaoRevertidas).toEqual([]);
    expect(deps.transacoes.itens).toHaveLength(0);
  });
});

describe('desfazerImportacao — NOVA_PARCELA_ORFA', () => {
  it('apaga as N parcelas geradas e o cadastro do parcelamento', async () => {
    const deps = fixture();
    const { importacaoId, itemId } = await seedImportacaoComItem(deps, {
      veredito: 'NOVA_PARCELA_ORFA',
      descricaoOriginal: 'LOJA MOVEIS 3/12',
      valorCents: 12_000,
      data: '2026-07-15', // competência da parcela 3
      parcelaAtual: 3,
      parcelaTotal: 12,
    });
    await confirmarItemImportado(deps, { importacaoId, itemId });
    expect(deps.parcelamentos.itens).toHaveLength(1);
    expect(deps.transacoes.itens).toHaveLength(10);

    const resultado = await desfazerImportacao(deps, importacaoId);

    expect(resultado.linhasRevertidas).toBe(1);
    expect(resultado.linhasNaoRevertidas).toEqual([]);
    expect(deps.parcelamentos.itens).toHaveLength(0);
    expect(deps.transacoes.itens).toHaveLength(0);

    const rascunho = await deps.importacoes.obter(importacaoId);
    expect(rascunho?.itens[0]?.decisao).toBe('PENDENTE');
  });

  it('parcela cujo ciclo fechou DEPOIS da confirmação bloqueia o parcelamento inteiro sem confirmação', async () => {
    // D-17c impede uma parcela órfã de NASCER em ciclo fechado (bloqueio
    // duro, sem `confirmarRetroativo`) — mas não impede que o ciclo em que
    // ela nasceu feche DEPOIS. É esse caso que o desfazer precisa cobrir: a
    // parcela nasceu legítima, em ciclo aberto, e só ficou "retroativa" com
    // o tempo. `parcelaAtual: 1` faz a compra inteira caber no ciclo aberto.
    const deps = fixture();
    const { importacaoId, itemId } = await seedImportacaoComItem(deps, {
      veredito: 'NOVA_PARCELA_ORFA',
      valorCents: 12_000,
      data: '2026-07-10',
      parcelaAtual: 1,
      parcelaTotal: 1,
    });
    await confirmarItemImportado(deps, { importacaoId, itemId });
    const totalParcelas = deps.transacoes.itens.length;
    expect(totalParcelas).toBeGreaterThan(0);
    expect(deps.transacoes.itens.every((t) => t.cicloId === CICLO_ABERTO_ID)).toBe(true);

    // O ciclo fecha depois — o dono só percebe que importou errado depois disso.
    await deps.ciclos.atualizar(CICLO_ABERTO_ID, { fechado: true, fechadoEm: '2026-08-05' });

    const semConfirmar = await desfazerImportacao(deps, importacaoId);
    expect(semConfirmar.linhasRevertidas).toBe(0);
    expect(semConfirmar.linhasNaoRevertidas[0]?.motivo).toMatch(/ciclo\(s\) já fechado/);
    expect(deps.transacoes.itens).toHaveLength(totalParcelas);
    expect(deps.parcelamentos.itens).toHaveLength(1);

    const comConfirmacao = await desfazerImportacao(deps, importacaoId, true);
    expect(comConfirmacao.linhasRevertidas).toBe(1);
    expect(deps.transacoes.itens).toHaveLength(0);
    expect(deps.parcelamentos.itens).toHaveLength(0);
  });
});

describe('desfazerImportacao — CASA_CUSTO_FIXO (🔴 risco R1, ao contrário)', () => {
  it('desmarca o custo fixo pago e NUNCA tenta apagar uma transação', async () => {
    const deps = fixture();
    deps.custosFixos.itens.push(custoFixoFake());
    const { importacaoId, itemId } = await seedImportacaoComItem(deps, {
      veredito: 'CASA_CUSTO_FIXO',
      alvoTipo: 'CUSTO_FIXO',
      alvoId: 'custo-luz',
    });
    await confirmarItemImportado(deps, { importacaoId, itemId });
    expect(deps.pagamentosFixos.itens).toHaveLength(1);
    expect(deps.transacoes.itens).toHaveLength(0);

    // Decoy defensivo: se algum bug em outra camada algum dia deixasse uma
    // transação com o `itemImportadoId` de uma linha CASA_CUSTO_FIXO, o
    // desfazer AINDA NÃO PODE apagá-la — `reverterLinhaGravada` decide pelo
    // `veredito` da linha antes de sequer olhar a âncora encontrada.
    deps.transacoes.itens.push(
      transacaoFake({ id: 'tx-decoy', itemImportadoId: itemId, origem: 'IMPORTACAO' }),
    );

    const resultado = await desfazerImportacao(deps, importacaoId);

    expect(resultado.linhasRevertidas).toBe(1);
    expect(deps.pagamentosFixos.itens).toHaveLength(0);
    // A transação-decoy segue intacta: a prova de que este caminho nunca
    // chama `excluirTransacao`/`aplicarLote` para uma linha CASA_CUSTO_FIXO.
    expect(deps.transacoes.itens).toHaveLength(1);
    expect(deps.transacoes.itens[0]?.id).toBe('tx-decoy');

    const rascunho = await deps.importacoes.obter(importacaoId);
    expect(rascunho?.itens[0]?.decisao).toBe('PENDENTE');
  });
});

describe('desfazerImportacao — CASA_VARIAVEL/CASA_PARCELA (APROVADA)', () => {
  it('reabre a linha sem tocar na transação existente', async () => {
    const deps = fixture();
    deps.transacoes.itens.push(transacaoFake({ id: 'tx-existente' }));
    const { importacaoId, itemId } = await seedImportacaoComItem(deps, {
      veredito: 'CASA_VARIAVEL',
      alvoTipo: 'TRANSACAO',
      alvoId: 'tx-existente',
    });
    await confirmarItemImportado(deps, { importacaoId, itemId });
    const rascunhoAntes = await deps.importacoes.obter(importacaoId);
    expect(rascunhoAntes?.itens[0]?.decisao).toBe('APROVADA');

    const resultado = await desfazerImportacao(deps, importacaoId);

    expect(resultado.linhasRevertidas).toBe(1);
    expect(deps.transacoes.itens).toHaveLength(1);
    expect(deps.transacoes.itens[0]?.id).toBe('tx-existente');
    const rascunhoDepois = await deps.importacoes.obter(importacaoId);
    expect(rascunhoDepois?.itens[0]?.decisao).toBe('PENDENTE');
  });
});

describe('desfazerImportacao — importação inexistente', () => {
  it('lança ImportacaoInexistenteError', async () => {
    const deps = fixture();
    await expect(desfazerImportacao(deps, 'importacao-fantasma')).rejects.toThrow(
      ImportacaoInexistenteError,
    );
  });
});
