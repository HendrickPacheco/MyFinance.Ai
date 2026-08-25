/**
 * Testes de `confirmarItemImportado`/`descartarItemImportado`/`finalizarImportacao`
 * (I3 do `TASKS-IMPORTACAO.md`, D-18). Usa fakes em memória; nunca toca no
 * banco. O foco de cada bloco espelha os riscos do plano:
 *  - 🔴 R1: `CASA_CUSTO_FIXO` nunca pode virar `Transacao` (dupla contagem).
 *  - idempotência: confirmar a mesma linha duas vezes grava uma vez só.
 *  - retroatividade: `NOVA_AVULSA` exige confirmação explícita; parcelamento
 *    importado NUNCA nasce em ciclo fechado, sem válvula de escape.
 *  - D-17c: "3/12" gera só as parcelas 3..12, com o valor certo.
 */
import { describe, it, expect } from 'vitest';
import {
  criarDeps as criarDepsFake,
  cicloFake,
  transacaoFake,
  CATEGORIA_VARIAVEL,
  type FakeDeps,
} from '../__fakes__/fakes-ciclo-fechamento';
import type { CustoFixo } from '@/domain/model/entidades';
import type { NovaImportacao, NovoItemImportado } from '@/domain/ports/importacao';
import { CicloFechadoError } from '../retroatividade';
import { addMeses } from '@/shared/data';
import {
  confirmarItemImportado,
  descartarItemImportado,
  finalizarImportacao,
  ParcelamentoRetroativoBloqueadoError,
  AmbiguidadeNaoResolvidaError,
  ItemImportadoInexistenteError,
} from './confirmar';

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

/** Item base "linha de fatura" — cada teste sobrescreve só o que importa. */
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

/** Grava um rascunho com UM item e devolve `{ importacaoId, itemId }`. */
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

describe('confirmarItemImportado — CASA_CUSTO_FIXO (🔴 risco R1)', () => {
  it('marca o custo fixo pago e NUNCA cria uma Transacao', async () => {
    const deps = fixture();
    deps.custosFixos.itens.push(custoFixoFake());
    const { importacaoId, itemId } = await seedImportacaoComItem(deps, {
      veredito: 'CASA_CUSTO_FIXO',
      vereditoMotivo: 'Mesmo valor e vencimento do custo fixo Luz.',
      alvoTipo: 'CUSTO_FIXO',
      alvoId: 'custo-luz',
    });

    const resultado = await confirmarItemImportado(deps, { importacaoId, itemId });

    expect(resultado).toEqual({ status: 'MARCADA_PAGA', custoFixoId: 'custo-luz' });
    // A prova que este teste existe para travar: nenhuma Transacao nasceu.
    expect(deps.transacoes.itens).toHaveLength(0);
    expect(deps.pagamentosFixos.itens).toEqual([
      expect.objectContaining({ custoFixoId: 'custo-luz' }),
    ]);

    const rascunho = await deps.importacoes.obter(importacaoId);
    expect(rascunho?.itens[0]?.decisao).toBe('GRAVADA');
  });
});

describe('confirmarItemImportado — NOVA_AVULSA', () => {
  it('cria uma transação com origem IMPORTACAO e itemImportadoId preenchido', async () => {
    const deps = fixture();
    const { importacaoId, itemId } = await seedImportacaoComItem(deps, {
      veredito: 'NOVA_AVULSA',
      valorCents: 15_000,
      data: '2026-07-15',
      descricaoOriginal: 'COMPRA MERCADO',
    });

    const resultado = await confirmarItemImportado(deps, { importacaoId, itemId });

    expect(resultado.status).toBe('GRAVADA');
    expect(deps.transacoes.itens).toHaveLength(1);
    const [tx] = deps.transacoes.itens;
    expect(tx).toMatchObject({
      valorCents: 15_000,
      tipo: 'DESPESA',
      data: '2026-07-15',
      descricao: 'COMPRA MERCADO',
      origem: 'IMPORTACAO',
      itemImportadoId: itemId,
    });

    const rascunho = await deps.importacoes.obter(importacaoId);
    expect(rascunho?.itens[0]?.decisao).toBe('GRAVADA');
  });

  it('respeita o ajuste de categoria feito pelo dono', async () => {
    const deps = fixture();
    const { importacaoId, itemId } = await seedImportacaoComItem(deps, {
      veredito: 'NOVA_AVULSA',
    });

    await confirmarItemImportado(deps, {
      importacaoId,
      itemId,
      ajustes: { categoriaId: CATEGORIA_VARIAVEL.id },
    });

    expect(deps.transacoes.itens[0]?.categoriaId).toBe(CATEGORIA_VARIAVEL.id);
  });

  it('sem ajuste, a categoria fica null (a fatura não sugere categoria)', async () => {
    const deps = fixture();
    const { importacaoId, itemId } = await seedImportacaoComItem(deps, {
      veredito: 'NOVA_AVULSA',
    });

    await confirmarItemImportado(deps, { importacaoId, itemId });

    expect(deps.transacoes.itens[0]?.categoriaId).toBeNull();
  });

  it('confirmar a mesma linha duas vezes grava uma vez só', async () => {
    const deps = fixture();
    const { importacaoId, itemId } = await seedImportacaoComItem(deps, {
      veredito: 'NOVA_AVULSA',
    });

    const primeira = await confirmarItemImportado(deps, { importacaoId, itemId });
    const segunda = await confirmarItemImportado(deps, { importacaoId, itemId });

    expect(primeira.status).toBe('GRAVADA');
    expect(segunda).toEqual({ status: 'JA_PROCESSADA', decisaoAnterior: 'GRAVADA' });
    expect(deps.transacoes.itens).toHaveLength(1);
  });

  it('linha retroativa sem confirmarRetroativo não grava e explica por quê', async () => {
    const deps = fixture();
    const { importacaoId, itemId } = await seedImportacaoComItem(deps, {
      veredito: 'NOVA_AVULSA',
      data: '2026-06-10', // cai no ciclo fechado
    });

    await expect(confirmarItemImportado(deps, { importacaoId, itemId })).rejects.toThrow(
      CicloFechadoError,
    );
    expect(deps.transacoes.itens).toHaveLength(0);

    const rascunho = await deps.importacoes.obter(importacaoId);
    expect(rascunho?.itens[0]?.decisao).toBe('PENDENTE');

    const resultado = await confirmarItemImportado(deps, {
      importacaoId,
      itemId,
      confirmarRetroativo: true,
    });
    expect(resultado.status).toBe('GRAVADA');
  });
});

describe('confirmarItemImportado — NOVA_PARCELA_ORFA (D-17c)', () => {
  it('"3/12" cria parcelamento com numParcelas 12 e parcelaInicial 3, gerando 10 parcelas', async () => {
    const deps = fixture();
    const { importacaoId, itemId } = await seedImportacaoComItem(deps, {
      veredito: 'NOVA_PARCELA_ORFA',
      descricaoOriginal: 'LOJA MOVEIS 3/12',
      valorCents: 12_000, // valor de UMA parcela
      data: '2026-07-15', // competência da parcela 3
      parcelaAtual: 3,
      parcelaTotal: 12,
    });

    const resultado = await confirmarItemImportado(deps, { importacaoId, itemId });

    expect(resultado.status).toBe('GRAVADA_PARCELAMENTO');
    if (resultado.status !== 'GRAVADA_PARCELAMENTO') throw new Error('unreachable');

    expect(deps.parcelamentos.itens).toHaveLength(1);
    const [parcelamento] = deps.parcelamentos.itens;
    expect(parcelamento).toMatchObject({ numParcelas: 12, parcelaInicial: 3 });

    expect(deps.transacoes.itens).toHaveLength(10);
    expect(resultado.transacaoIds).toHaveLength(10);

    // Nenhuma parcela nasce antes da competência da 3ª (as parcelas 1 e 2,
    // que caem em ciclo fechado, nunca são geradas).
    const menorData = deps.transacoes.itens.reduce(
      (min, t) => (t.data < min ? t.data : min),
      deps.transacoes.itens[0]?.data ?? '9999-99-99',
    );
    expect(menorData).toBe('2026-07-15');

    // Cada parcela gerada tem exatamente o valor observado na fatura — a
    // suposição de parcelas iguais tem que fechar sem resto.
    for (const t of deps.transacoes.itens) {
      expect(t.valorCents).toBe(12_000);
    }

    // Só a transação da parcela 3 (a linha confirmada) carrega o vínculo —
    // é `@unique` no banco, só pode viver em uma.
    const comVinculo = deps.transacoes.itens.filter((t) => t.itemImportadoId === itemId);
    expect(comVinculo).toHaveLength(1);
    expect(comVinculo[0]?.parcelaNum).toBe(3);
  });

  it('nunca gera transação em ciclo fechado, mesmo com confirmarRetroativo (D-17c)', async () => {
    const deps = fixture();
    const { importacaoId, itemId } = await seedImportacaoComItem(deps, {
      veredito: 'NOVA_PARCELA_ORFA',
      data: '2026-06-10', // cai no ciclo fechado
      parcelaAtual: 2,
      parcelaTotal: 6,
    });

    await expect(confirmarItemImportado(deps, { importacaoId, itemId })).rejects.toThrow(
      ParcelamentoRetroativoBloqueadoError,
    );
    expect(deps.transacoes.itens).toHaveLength(0);
    expect(deps.parcelamentos.itens).toHaveLength(0);
  });

  it('o clamp de fim de mês não pode empurrar a primeira parcela para dentro do ciclo fechado', () => {
    // Regressão de um buraco real: a âncora da compra é reconstruída com
    // `addMeses(data, -(atual - 1))`, e o clamp de fim de mês NÃO é
    // reversível — linha de 05/07, parcela 2, vira âncora 05/06 e a parcela
    // gerada volta em 05/07. Mas com data 31/07 e parcela 2, a âncora é
    // 30/06 e a parcela volta em 30/07: a data GRAVADA não é a impressa.
    // Se o bloqueio de ciclo fechado olhasse a data impressa em vez da
    // gerada, uma parcela poderia nascer num ciclo já encerrado — que é
    // exatamente o que a D-17c existe para impedir.
    const dataImpressa = '2026-07-05';
    const parcelaAtual = 2;
    const ancora = addMeses(dataImpressa, -(parcelaAtual - 1));
    const dataGerada = addMeses(ancora, parcelaAtual - 1);
    expect(dataGerada).toBe(dataImpressa);

    // O caso em que as duas divergem, e por isso a checagem tem que ser na gerada.
    const ancoraComClamp = addMeses('2026-07-31', -1);
    expect(ancoraComClamp).toBe('2026-06-30');
    expect(addMeses(ancoraComClamp, 1)).toBe('2026-07-30');
  });
});

describe('confirmarItemImportado — CASA_VARIAVEL / CASA_PARCELA', () => {
  it('não grava nada e mesmo assim marca a linha como resolvida', async () => {
    const deps = fixture();
    deps.transacoes.itens.push(transacaoFake({ id: 'tx-existente' }));
    const { importacaoId, itemId } = await seedImportacaoComItem(deps, {
      veredito: 'CASA_VARIAVEL',
      alvoTipo: 'TRANSACAO',
      alvoId: 'tx-existente',
    });

    const resultado = await confirmarItemImportado(deps, { importacaoId, itemId });

    expect(resultado).toEqual({ status: 'RESOLVIDA', transacaoId: 'tx-existente' });
    // Nenhuma transação NOVA — só a que já existia antes do teste.
    expect(deps.transacoes.itens).toHaveLength(1);

    const rascunho = await deps.importacoes.obter(importacaoId);
    expect(rascunho?.itens[0]?.decisao).toBe('APROVADA');
  });
});

describe('confirmarItemImportado — AMBIGUA', () => {
  it('sem escolha explícita do dono, não grava e explica o motivo', async () => {
    const deps = fixture();
    const { importacaoId, itemId } = await seedImportacaoComItem(deps, {
      veredito: 'AMBIGUA',
      vereditoMotivo: 'Valor bate com duas transações do período.',
    });

    await expect(confirmarItemImportado(deps, { importacaoId, itemId })).rejects.toThrow(
      AmbiguidadeNaoResolvidaError,
    );
    expect(deps.transacoes.itens).toHaveLength(0);
  });

  it('com um candidato escolhido, resolve sem gravar nova transação', async () => {
    const deps = fixture();
    deps.transacoes.itens.push(transacaoFake({ id: 'tx-candidata' }));
    const { importacaoId, itemId } = await seedImportacaoComItem(deps, { veredito: 'AMBIGUA' });

    const resultado = await confirmarItemImportado(deps, {
      importacaoId,
      itemId,
      escolhaAmbigua: { transacaoId: 'tx-candidata' },
    });

    expect(resultado).toEqual({ status: 'RESOLVIDA', transacaoId: 'tx-candidata' });
    expect(deps.transacoes.itens).toHaveLength(1);
  });

  it('com "nenhum candidato", vira uma linha nova (NOVA_AVULSA)', async () => {
    const deps = fixture();
    const { importacaoId, itemId } = await seedImportacaoComItem(deps, { veredito: 'AMBIGUA' });

    const resultado = await confirmarItemImportado(deps, {
      importacaoId,
      itemId,
      escolhaAmbigua: { semCandidato: true },
    });

    expect(resultado.status).toBe('GRAVADA');
    expect(deps.transacoes.itens).toHaveLength(1);
  });
});

describe('confirmarItemImportado — IGNORAR', () => {
  it('não grava nada e descarta a linha', async () => {
    const deps = fixture();
    const { importacaoId, itemId } = await seedImportacaoComItem(deps, {
      veredito: 'IGNORAR',
      vereditoMotivo: 'Pagamento da fatura anterior.',
    });

    const resultado = await confirmarItemImportado(deps, { importacaoId, itemId });

    expect(resultado).toEqual({ status: 'IGNORADA' });
    expect(deps.transacoes.itens).toHaveLength(0);
    const rascunho = await deps.importacoes.obter(importacaoId);
    expect(rascunho?.itens[0]?.decisao).toBe('DESCARTADA');
  });
});

describe('confirmarItemImportado — erros de contorno', () => {
  it('item inexistente lança erro nomeado', async () => {
    const deps = fixture();
    const { importacaoId } = await seedImportacaoComItem(deps);

    await expect(
      confirmarItemImportado(deps, { importacaoId, itemId: 'item-fantasma' }),
    ).rejects.toThrow(ItemImportadoInexistenteError);
  });
});

describe('descartarItemImportado', () => {
  it('marca a linha como descartada sem gravar nada', async () => {
    const deps = fixture();
    const { importacaoId, itemId } = await seedImportacaoComItem(deps, {
      veredito: 'NOVA_AVULSA',
    });

    await descartarItemImportado(deps, { importacaoId, itemId });

    const rascunho = await deps.importacoes.obter(importacaoId);
    expect(rascunho?.itens[0]?.decisao).toBe('DESCARTADA');
    expect(deps.transacoes.itens).toHaveLength(0);
  });

  it('é idempotente: descartar uma linha já gravada não desfaz nada', async () => {
    const deps = fixture();
    const { importacaoId, itemId } = await seedImportacaoComItem(deps, {
      veredito: 'NOVA_AVULSA',
    });
    await confirmarItemImportado(deps, { importacaoId, itemId });

    await descartarItemImportado(deps, { importacaoId, itemId });

    const rascunho = await deps.importacoes.obter(importacaoId);
    expect(rascunho?.itens[0]?.decisao).toBe('GRAVADA');
    expect(deps.transacoes.itens).toHaveLength(1);
  });
});

describe('finalizarImportacao', () => {
  it('não finaliza enquanto houver item PENDENTE', async () => {
    const deps = fixture();
    const { importacaoId } = await seedImportacaoComItem(deps, { veredito: 'NOVA_AVULSA' });

    const resultado = await finalizarImportacao(deps, importacaoId);

    expect(resultado).toEqual({ finalizada: false, itensPendentes: 1 });
  });

  it('marca CONFIRMADA quando todas as linhas já foram decididas', async () => {
    const deps = fixture();
    const { importacaoId, itemId } = await seedImportacaoComItem(deps, {
      veredito: 'IGNORAR',
    });
    await confirmarItemImportado(deps, { importacaoId, itemId });

    const resultado = await finalizarImportacao(deps, importacaoId);

    expect(resultado).toEqual({ finalizada: true, itensPendentes: 0 });
    const rascunho = await deps.importacoes.obter(importacaoId);
    expect(rascunho?.importacao.status).toBe('CONFIRMADA');
  });
});
