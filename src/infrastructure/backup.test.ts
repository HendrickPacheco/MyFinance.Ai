/**
 * Testes de export/import (SPEC 8, critério de aceite 9):
 * export -> estado zerado -> import restaura o estado completo.
 *
 * O `node:fs` é mockado: NENHUM arquivo é escrito em `data/` e o banco real
 * (Postgres) nunca é tocado. O PrismaClient é um fake em memória.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import type { PrismaClient } from '@prisma/client';
import {
  exportarTudo,
  importarTudo,
  BACKUP_VERSION,
  BackupSalvaguardaError,
  BackupVersaoIncompativelError,
} from './backup';
import { contemValorMonetario } from '@/domain/memoria/regras';

vi.mock('node:fs', () => ({
  promises: { mkdir: vi.fn(async () => undefined), writeFile: vi.fn(async () => undefined) },
}));

const mkdirMock = vi.mocked(fs.mkdir);
const writeFileMock = vi.mocked(fs.writeFile);

type Linha = Record<string, unknown>;

/** Dono das linhas nos testes (multi-tenant). */
const DONO_TESTE = 'dono-1';

/**
 * Remove `donoId` — um arquivo de backup real nunca o carrega (ele é removido
 * na exportação e recarimbado na importação). Usado para montar payloads que
 * imitam um arquivo de verdade a partir das tabelas do fake.
 */
function comoArquivo<T extends Record<string, unknown>>(linhas: T[]): Omit<T, 'donoId'>[] {
  return linhas.map(({ donoId: _ignorado, ...resto }) => resto);
}

const NOMES_TABELAS = [
  'config',
  'conta',
  'categoria',
  'custoFixo',
  'provisaoAnual',
  'parcelamento',
  'ciclo',
  'pagamentoFixo',
  'transacao',
  'snapshotPatrimonio',
  'itemPatrimonio',
  // Memória do copiloto (Fase E, BACKUP_VERSION 3). Sem FK própria.
  'memoria',
  // Importação de fatura (I1, BACKUP_VERSION 4).
  'importacao',
  'itemImportado',
] as const;

type NomeTabela = (typeof NOMES_TABELAS)[number];
type Tabelas = Record<NomeTabela, Linha[]>;

/** Primeira linha da tabela, com erro explícito (noUncheckedIndexedAccess). */
function primeiraLinha(linhas: Linha[]): Linha {
  const [linha] = linhas;
  if (!linha) throw new Error('tabela vazia');
  return linha;
}

interface FakePrisma {
  client: PrismaClient;
  tabelas: Tabelas;
  transacoesAbertas: number;
  ordemInsercaoTransacao: string[];
}

/**
 * Espelha as FKs reais das migrations (`prisma/migrations/*\/migration.sql`)
 * para o fake em memória simular o mesmo comportamento do PostgreSQL:
 * `RESTRICT` na deleção (linha filha viva bloqueia apagar o pai) e violação
 * de integridade na inserção (FK apontando para um pai que ainda não
 * existe, verificado independente da ação de `ON DELETE`). Isto é o que
 * torna os testes de ORDEM de import/export (FKs impostas pelo Postgres,
 * diferente do SQLite antigo) capazes de FALHAR de verdade quando alguém
 * inverte a ordem — sem isso, um fake "burro" deixaria a ordem errada
 * passar silenciosamente.
 *
 * `restrict: true` só em `PagamentoFixo.custoFixoId`/`cicloId` — são as
 * ÚNICAS FKs `ON DELETE RESTRICT` do schema hoje (migration
 * `20260803213122_pagamento_fixo`). Todas as demais são `SET NULL` (ou
 * `CASCADE` em `ItemPatrimonio.snapshotId`), que nunca bloqueiam a deleção
 * do pai — por isso não entram na checagem de RESTRICT abaixo.
 */
const FKS: ReadonlyArray<{ tabela: NomeTabela; campo: string; pai: NomeTabela; restrict: boolean }> = [
  { tabela: 'custoFixo', campo: 'contaId', pai: 'conta', restrict: false },
  { tabela: 'config', campo: 'destinoSobraContaId', pai: 'conta', restrict: false },
  { tabela: 'parcelamento', campo: 'categoriaId', pai: 'categoria', restrict: false },
  { tabela: 'pagamentoFixo', campo: 'custoFixoId', pai: 'custoFixo', restrict: true },
  { tabela: 'pagamentoFixo', campo: 'cicloId', pai: 'ciclo', restrict: true },
  { tabela: 'transacao', campo: 'categoriaId', pai: 'categoria', restrict: false },
  { tabela: 'transacao', campo: 'contaId', pai: 'conta', restrict: false },
  { tabela: 'transacao', campo: 'contaDestinoId', pai: 'conta', restrict: false },
  { tabela: 'transacao', campo: 'provisaoId', pai: 'provisaoAnual', restrict: false },
  { tabela: 'transacao', campo: 'parcelamentoId', pai: 'parcelamento', restrict: false },
  { tabela: 'transacao', campo: 'estornoDeId', pai: 'transacao', restrict: false },
  { tabela: 'transacao', campo: 'cicloId', pai: 'ciclo', restrict: false },
  { tabela: 'itemPatrimonio', campo: 'snapshotId', pai: 'snapshotPatrimonio', restrict: false },
  // I1: a transação aponta para a linha da fatura que a originou (SET NULL), e
  // o item aponta para a importação que o contém (CASCADE). Nenhuma é RESTRICT.
  { tabela: 'itemImportado', campo: 'importacaoId', pai: 'importacao', restrict: false },
  { tabela: 'transacao', campo: 'itemImportadoId', pai: 'itemImportado', restrict: false },
];

class ViolacaoDeChaveEstrangeiraSimulada extends Error {}

function criarFakePrisma(): FakePrisma {
  const tabelas: Tabelas = {
    config: [],
    conta: [],
    categoria: [],
    custoFixo: [],
    provisaoAnual: [],
    parcelamento: [],
    ciclo: [],
    pagamentoFixo: [],
    transacao: [],
    snapshotPatrimonio: [],
    itemPatrimonio: [],
    memoria: [],
    importacao: [],
    itemImportado: [],
  };
  const estado = { transacoesAbertas: 0, ordemInsercaoTransacao: [] as string[] };

  /** Rejeita o insert se alguma FK apontar para um pai que ainda não existe. */
  function validarFksDeInsercao(nome: NomeTabela, linha: Linha): void {
    for (const fk of FKS) {
      if (fk.tabela !== nome) continue;
      const valor = linha[fk.campo];
      if (valor === null || valor === undefined) continue;
      const paiExiste = tabelas[fk.pai].some((p) => p.id === valor);
      if (!paiExiste) {
        throw new ViolacaoDeChaveEstrangeiraSimulada(
          `FK violation: ${nome}.${fk.campo}=${String(valor)} não existe em ${fk.pai} — ` +
            'insert fora de ordem (pai precisa existir antes do filho).',
        );
      }
    }
  }

  /** Rejeita o deleteMany se alguma linha filha `ON DELETE RESTRICT` ainda referenciar esta tabela. */
  function validarFksDeDelecao(nome: NomeTabela): void {
    const idsDoPai = new Set(tabelas[nome].map((l) => l.id));
    if (idsDoPai.size === 0) return;
    for (const fk of FKS) {
      if (fk.pai !== nome || !fk.restrict) continue;
      // Auto-referência: o deleteMany desta tabela apaga TODAS as linhas de
      // uma vez, incluindo as que se referenciam entre si — não há órfão
      // intermediário. (Nenhuma FK restrict hoje é auto-referente, mas a
      // guarda fica por segurança caso uma seja adicionada no futuro.)
      if (fk.tabela === fk.pai) continue;
      const filhoOrfaoRestante = tabelas[fk.tabela].some((l) => {
        const valor = l[fk.campo];
        return valor !== null && valor !== undefined && idsDoPai.has(valor as string);
      });
      if (filhoOrfaoRestante) {
        throw new ViolacaoDeChaveEstrangeiraSimulada(
          `FK violation: não é possível apagar ${nome} — ${fk.tabela}.${fk.campo} ainda referencia ` +
            'linhas existentes (delete fora de ordem, filho precisa sumir antes do pai).',
        );
      }
    }
  }

  function delegate(nome: NomeTabela) {
    return {
      findMany: async (args?: {
        where?: Record<string, unknown>;
        include?: { itens?: unknown };
      }): Promise<Linha[]> => {
        // O `where` passou a ser APLICADO (antes era ignorado): o export de
        // importações filtra por `status: 'CONFIRMADA'`, e um fake que devolve
        // tudo faria o teste dessa regra passar sem ela existir. Só igualdade
        // escalar — é tudo que o backup usa.
        const casa = (linha: Linha): boolean =>
          Object.entries(args?.where ?? {}).every(([campo, valor]) => linha[campo] === valor);
        const linhas = tabelas[nome].filter(casa).map((l) => ({ ...l }));
        if (nome === 'snapshotPatrimonio' && args?.include?.itens) {
          return linhas.map((s) => ({
            ...s,
            itens: tabelas.itemPatrimonio
              .filter((i) => i.snapshotId === s.id)
              .map((i) => ({ ...i })),
          }));
        }
        if (nome === 'importacao' && args?.include?.itens) {
          return linhas.map((imp) => ({
            ...imp,
            itens: tabelas.itemImportado
              .filter((i) => i.importacaoId === imp.id)
              .map((i) => ({ ...i }))
              .sort((x, y) => Number(x.ordem) - Number(y.ordem)),
          }));
        }
        return linhas;
      },
      findUnique: async (args: {
        where: { id?: unknown; donoId?: unknown };
      }): Promise<Linha | null> => {
        // Depois da virada multi-tenant a Config é buscada por `donoId`
        // (deixou de ser singleton id=1), então o fake precisa casar pelos dois.
        const achado = tabelas[nome].find((l) =>
          args.where.id !== undefined
            ? l.id === args.where.id
            : l.donoId === args.where.donoId,
        );
        return achado ? { ...achado } : null;
      },
      create: async (args: { data: Linha }): Promise<Linha> => {
        validarFksDeInsercao(nome, args.data);
        const linha = { ...args.data };
        tabelas[nome].push(linha);
        return linha;
      },
      createMany: async (args: { data: Linha[] }): Promise<{ count: number }> => {
        for (const l of args.data) {
          validarFksDeInsercao(nome, l);
          tabelas[nome].push({ ...l });
          if (nome === 'transacao') estado.ordemInsercaoTransacao.push(String(l.id));
        }
        return { count: args.data.length };
      },
      deleteMany: async (): Promise<{ count: number }> => {
        validarFksDeDelecao(nome);
        const n = tabelas[nome].length;
        tabelas[nome] = [];
        return { count: n };
      },
    };
  }

  const client = {
    ...Object.fromEntries(NOMES_TABELAS.map((n) => [n, delegate(n)])),
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      estado.transacoesAbertas += 1;
      return fn(client);
    },
  };

  return {
    client: client as unknown as PrismaClient,
    tabelas,
    get transacoesAbertas() {
      return estado.transacoesAbertas;
    },
    get ordemInsercaoTransacao() {
      return estado.ordemInsercaoTransacao;
    },
  };
}

/** Estado completo e realista: centavos Int e datas civis String. */
function semear(tabelas: Tabelas): void {
  // Carimba o dono em tudo que for semeado abaixo (multi-tenant): sem isso, o
  // export escopado por dono não acharia nada.
  const carimbarDono = () => {
    for (const nome of NOMES_TABELAS) {
      if (nome === 'itemPatrimonio') continue; // herda o dono do snapshot
      for (const linha of tabelas[nome]) linha.donoId ??= DONO_TESTE;
    }
  };
  tabelas.config.push({
    id: 1,
    rendaBaseCents: 812_345,
    rendaVariavel: false,
    diaRecebimento: 5,
    metaPoupancaCents: 100_007,
    metaPoupancaPercent: null,
    moeda: 'BRL',
    timezone: 'America/Bahia',
    destinoSobra: 'RESERVA',
    destinoSobraContaId: 'conta-reserva',
  });
  tabelas.conta.push(
    { id: 'conta-reserva', nome: 'Reserva', tipo: 'RESERVA', saldoCents: 1_234_567, incluiPatrimonio: true, arquivada: false },
    { id: 'conta-var', nome: 'Nubank', tipo: 'VARIAVEL', saldoCents: 1, incluiPatrimonio: true, arquivada: false },
  );
  tabelas.categoria.push({
    id: 'cat-mercado',
    nome: 'Mercado',
    grupo: 'VARIAVEL',
    essencial: true,
    icone: null,
    cor: null,
    ordem: 1,
  });
  tabelas.custoFixo.push({
    id: 'fixo-aluguel',
    nome: 'Aluguel',
    valorCents: 200_000,
    diaVencimento: 10,
    ativo: true,
    contaId: 'conta-var',
    // Aresta fechada na G0: o custo fixo aponta para uma Categoria de verdade.
    categoriaId: 'cat-mercado',
  });
  tabelas.provisaoAnual.push({
    id: 'prov-ipva',
    nome: 'IPVA',
    valorAnualCents: 120_001,
    mesEsperado: 1,
    acumuladoCents: 10_000,
    ativo: true,
  });
  tabelas.parcelamento.push({
    id: 'parc-1',
    descricao: 'Notebook',
    valorTotalCents: 1_000,
    numParcelas: 3,
    dataCompra: '2026-07-10',
    categoriaId: 'cat-mercado',
  });
  tabelas.ciclo.push({
    id: 'ciclo-julho',
    dataInicio: '2026-07-05',
    dataFim: '2026-08-04',
    rendaPrevistaCents: 812_345,
    rendaRealizadaCents: 800_000,
    poupancaAlvoCents: 100_007,
    fixosCents: 200_000,
    provisaoMensalCents: 10_000,
    verbaVariavelCents: 502_338,
    rolloverRecebidoCents: -1,
    fechado: true,
    fechadoEm: '2026-08-05',
    sobraCents: 12_345,
    observacao: null,
    // Primeiro ciclo do dono: não há anterior, e `null` é o valor correto.
    cicloAnteriorId: null,
  });
  tabelas.pagamentoFixo.push({
    id: 'pag-aluguel-julho',
    custoFixoId: 'fixo-aluguel',
    cicloId: 'ciclo-julho',
    pagoEm: '2026-07-09',
    createdAt: '2026-07-09T12:00:00.000Z',
  });
  tabelas.transacao.push(
    {
      id: 'tx-original',
      data: '2026-07-31',
      valorCents: 9_999,
      tipo: 'DESPESA',
      descricao: 'Compra às 23h50',
      metodo: 'PIX',
      categoriaId: 'cat-mercado',
      contaId: 'conta-var',
      contaDestinoId: null,
      provisaoId: null,
      parcelamentoId: null,
      parcelaNum: null,
      estornoDeId: null,
      cicloId: 'ciclo-julho',
      pagoEm: '2026-07-31',
      origem: 'MANUAL',
      itemImportadoId: null,
    },
    {
      id: 'tx-estorno',
      data: '2026-07-31',
      valorCents: 9_999,
      tipo: 'ESTORNO',
      descricao: 'Devolução',
      metodo: null,
      categoriaId: 'cat-mercado',
      contaId: 'conta-var',
      contaDestinoId: null,
      provisaoId: null,
      parcelamentoId: null,
      parcelaNum: null,
      estornoDeId: 'tx-original',
      cicloId: 'ciclo-julho',
      pagoEm: null,
      origem: 'MANUAL',
      itemImportadoId: null,
    },
  );
  tabelas.snapshotPatrimonio.push({ id: 'snap-1', data: '2026-08-05', totalCents: 1_234_568 });
  tabelas.itemPatrimonio.push(
    // `contaId` preenchido de propósito num item e null no outro: o round-trip
    // tem que preservar o vínculo de conciliação, e perdê-lo em silêncio faria
    // a tela de patrimônio parar de acusar divergência sem erro nenhum.
    {
      id: 'item-1',
      snapshotId: 'snap-1',
      nome: 'Reserva',
      classe: 'CONTA',
      valorCents: 1_234_567,
      contaId: 'conta-reserva',
    },
    { id: 'item-2', snapshotId: 'snap-1', nome: 'Bitcoin', classe: 'CRIPTO', valorCents: 1, contaId: null },
  );

  // Memória do copiloto (Fase E). Sem `embedding` de propósito: o vetor não é
  // legível pelo Prisma Client (campo `Unsupported`) e não viaja no backup.
  tabelas.memoria.push(
    {
      id: 'mem-1',
      tipo: 'PLANO',
      texto: 'quer sair do aluguel até 2028',
      origem: 'USUARIO',
      ativo: true,
    },
    {
      id: 'mem-2',
      tipo: 'PREFERENCIA',
      texto: 'corta lazer antes de cortar alimentação',
      origem: 'COPILOTO',
      ativo: false,
    },
  );

  // Importação de fatura já CONFIRMADA (I1). Só as confirmadas viajam no
  // backup — rascunho é estado de tela, não fato financeiro. Os BYTES do
  // documento não existem em lugar nenhum: só o hash e as linhas transcritas.
  tabelas.importacao.push({
    id: 'imp-confirmada',
    origem: 'PDF',
    nomeArquivo: 'fatura-agosto.pdf',
    hashConteudo: 'sha256-fatura-agosto',
    competenciaRef: '2026-08',
    status: 'CONFIRMADA',
    tokensEntrada: 1_200,
    tokensSaida: 300,
    criadaEm: '2026-08-06T10:00:00.000Z',
    confirmadaEm: '2026-08-06T10:05:00.000Z',
  });
  tabelas.itemImportado.push({
    id: 'item-imp-1',
    importacaoId: 'imp-confirmada',
    ordem: 0,
    descricaoOriginal: 'MERCADO XYZ 03/08',
    valorCents: 4_599,
    sinal: 'COMPRA',
    data: '2026-08-03',
    dataOriginalTexto: '03/08',
    parcelaAtual: null,
    parcelaTotal: null,
    confianca: 'ALTA',
    veredito: 'NOVA_AVULSA',
    vereditoMotivo: 'não casou com nenhum lançamento do período',
    alvoTipo: null,
    alvoId: null,
    decisao: 'GRAVADA',
    chaveDedup: '2026-08-03|mercado xyz|4599',
  });

  carimbarDono();
}

function copiaProfunda(t: Tabelas): Tabelas {
  return structuredClone(t);
}

function zerar(t: Tabelas): void {
  for (const nome of NOMES_TABELAS) t[nome] = [];
}

beforeEach(() => {
  mkdirMock.mockClear();
  mkdirMock.mockResolvedValue(undefined);
  writeFileMock.mockClear();
  writeFileMock.mockResolvedValue(undefined);
});

describe('exportarTudo', () => {
  it('carimba a versão do formato e devolve todas as coleções', async () => {
    const db = criarFakePrisma();
    semear(db.tabelas);

    const payload = (await exportarTudo(db.client, DONO_TESTE)) as {
      version: number;
      exportadoEm: string;
      dados: Record<string, unknown>;
    };

    expect(payload.version).toBe(BACKUP_VERSION);
    expect(typeof payload.exportadoEm).toBe('string');
    expect(Object.keys(payload.dados).sort()).toEqual(
      [
        'ciclos',
        'categorias',
        'config',
        'contas',
        'custosFixos',
        'memorias',
        'pagamentosFixos',
        'parcelamentos',
        'provisoes',
        'snapshots',
        'transacoes',
        'importacoes',
      ].sort(),
    );
  });

  it('inclui os pagamentos de custo fixo (rastreamento de "pago?")', async () => {
    const db = criarFakePrisma();
    semear(db.tabelas);

    const payload = (await exportarTudo(db.client, DONO_TESTE)) as {
      dados: { pagamentosFixos: Array<{ id: string; custoFixoId: string; cicloId: string; pagoEm: string }> };
    };

    expect(payload.dados.pagamentosFixos).toHaveLength(1);
    expect(payload.dados.pagamentosFixos[0]).toMatchObject({
      id: 'pag-aluguel-julho',
      custoFixoId: 'fixo-aluguel',
      cicloId: 'ciclo-julho',
      pagoEm: '2026-07-09',
    });
  });

  it('exporta os itens do snapshot aninhados', async () => {
    const db = criarFakePrisma();
    semear(db.tabelas);

    const payload = (await exportarTudo(db.client, DONO_TESTE)) as {
      dados: { snapshots: Array<{ id: string; itens: Array<{ valorCents: number }> }> };
    };

    expect(payload.dados.snapshots).toHaveLength(1);
    const snapshot = payload.dados.snapshots[0];
    expect(snapshot?.itens).toHaveLength(2);
    expect(snapshot?.itens.map((i) => i.valorCents)).toEqual([1_234_567, 1]);
  });

  it('base vazia exporta config null e coleções vazias', async () => {
    const db = criarFakePrisma();

    const payload = (await exportarTudo(db.client, DONO_TESTE)) as {
      dados: { config: unknown; contas: unknown[]; transacoes: unknown[] };
    };

    expect(payload.dados.config).toBeNull();
    expect(payload.dados.contas).toEqual([]);
    expect(payload.dados.transacoes).toEqual([]);
  });
});

describe('round-trip (critério de aceite 9): export -> zerado -> import', () => {
  it('restaura o estado completo, com centavos exatos e datas civis como string', async () => {
    // Arrange
    const db = criarFakePrisma();
    semear(db.tabelas);
    const esperado = copiaProfunda(db.tabelas);

    // Act: export -> serializa como o arquivo .json faria -> zera -> import
    const payload = await exportarTudo(db.client, DONO_TESTE);
    const arquivo: unknown = JSON.parse(JSON.stringify(payload));
    zerar(db.tabelas);
    expect(db.tabelas.transacao).toEqual([]);

    const { backupCriado } = await importarTudo(db.client, arquivo, DONO_TESTE);

    // Assert: estado idêntico, tabela por tabela.
    for (const nome of NOMES_TABELAS) {
      expect(db.tabelas[nome]).toEqual(esperado[nome]);
    }
    expect(backupCriado).toMatch(/data[\\/]app\.backup-.*\.json$/);
  });

  it('preserva os valores monetários como Int em centavos (sem float)', async () => {
    const db = criarFakePrisma();
    semear(db.tabelas);

    const payload = await exportarTudo(db.client, DONO_TESTE);
    zerar(db.tabelas);
    await importarTudo(db.client, JSON.parse(JSON.stringify(payload)), DONO_TESTE);

    const ciclo = primeiraLinha(db.tabelas.ciclo);
    expect(ciclo.verbaVariavelCents).toBe(502_338);
    expect(Number.isInteger(ciclo.verbaVariavelCents)).toBe(true);
    expect(ciclo.rolloverRecebidoCents).toBe(-1);
    expect(primeiraLinha(db.tabelas.conta).saldoCents).toBe(1_234_567);
    expect(primeiraLinha(db.tabelas.provisaoAnual).valorAnualCents).toBe(120_001);
    expect(db.tabelas.itemPatrimonio[1]?.valorCents).toBe(1);
    expect(primeiraLinha(db.tabelas.config).rendaBaseCents).toBe(812_345);
  });

  it('preserva as datas civis como string "YYYY-MM-DD" (sem virar Date/UTC)', async () => {
    const db = criarFakePrisma();
    semear(db.tabelas);

    const payload = await exportarTudo(db.client, DONO_TESTE);
    zerar(db.tabelas);
    await importarTudo(db.client, JSON.parse(JSON.stringify(payload)), DONO_TESTE);

    const ciclo = primeiraLinha(db.tabelas.ciclo);
    expect(ciclo.dataInicio).toBe('2026-07-05');
    expect(ciclo.dataFim).toBe('2026-08-04');
    expect(ciclo.fechadoEm).toBe('2026-08-05');
    expect(typeof ciclo.dataInicio).toBe('string');

    // Regressão do bug UTC: 31/07 (lançamento às 23h50) continua 31/07.
    const tx = db.tabelas.transacao.find((t) => t.id === 'tx-original');
    expect(tx?.data).toBe('2026-07-31');
    expect(typeof tx?.data).toBe('string');
    expect(primeiraLinha(db.tabelas.snapshotPatrimonio).data).toBe('2026-08-05');
    expect(primeiraLinha(db.tabelas.parcelamento).dataCompra).toBe('2026-07-10');
  });

  it('insere as transações originais ANTES das estornadoras (FK auto-referente)', async () => {
    const db = criarFakePrisma();
    semear(db.tabelas);
    // Inverte a ordem no payload para forçar o reordenamento.
    db.tabelas.transacao.reverse();

    const payload = await exportarTudo(db.client, DONO_TESTE);
    zerar(db.tabelas);
    await importarTudo(db.client, JSON.parse(JSON.stringify(payload)), DONO_TESTE);

    expect(db.ordemInsercaoTransacao).toEqual(['tx-original', 'tx-estorno']);
  });

  it('restaura com sucesso mesmo havendo PagamentoFixo (FK ON DELETE RESTRICT p/ CustoFixo e Ciclo)', async () => {
    // Regressão do problema #2 da auditoria: com linhas em PagamentoFixo,
    // apagar Ciclo/CustoFixo antes de PagamentoFixo bate na FK RESTRICT e
    // aborta a transação. O fake simula essa mesma constraint (ver FKS).
    const db = criarFakePrisma();
    semear(db.tabelas);
    expect(db.tabelas.pagamentoFixo).toHaveLength(1);

    const payload = await exportarTudo(db.client, DONO_TESTE);
    zerar(db.tabelas);

    await expect(importarTudo(db.client, JSON.parse(JSON.stringify(payload)), DONO_TESTE)).resolves.toMatchObject({
      backupCriado: expect.stringMatching(/data[\\/]app\.backup-.*\.json$/) as unknown as string,
    });
    expect(primeiraLinha(db.tabelas.pagamentoFixo)).toMatchObject({
      id: 'pag-aluguel-julho',
      custoFixoId: 'fixo-aluguel',
      cicloId: 'ciclo-julho',
      pagoEm: '2026-07-09',
    });
  });

  it('preserva Transacao.pagoEm no round-trip (nulo e preenchido)', async () => {
    const db = criarFakePrisma();
    semear(db.tabelas);

    const payload = await exportarTudo(db.client, DONO_TESTE);
    zerar(db.tabelas);
    await importarTudo(db.client, JSON.parse(JSON.stringify(payload)), DONO_TESTE);

    const original = db.tabelas.transacao.find((t) => t.id === 'tx-original');
    const estorno = db.tabelas.transacao.find((t) => t.id === 'tx-estorno');
    expect(original?.pagoEm).toBe('2026-07-31');
    expect(typeof original?.pagoEm).toBe('string');
    expect(estorno?.pagoEm).toBeNull();
  });

  it('grava a salvaguarda em JSON (./data) ANTES de qualquer escrita destrutiva', async () => {
    const db = criarFakePrisma();
    semear(db.tabelas);
    const payload = await exportarTudo(db.client, DONO_TESTE);

    await importarTudo(db.client, JSON.parse(JSON.stringify(payload)), DONO_TESTE);

    expect(mkdirMock).toHaveBeenCalledTimes(1);
    expect(String(mkdirMock.mock.calls[0]?.[0])).toMatch(/\/data$/);
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const chamada = writeFileMock.mock.calls[0];
    expect(String(chamada?.[0])).toMatch(/data[\\/]app\.backup-.*\.json$/);
    const conteudoGravado = JSON.parse(String(chamada?.[1])) as { version: number };
    expect(conteudoGravado.version).toBe(BACKUP_VERSION);
  });

  it('aborta o import se a salvaguarda falhar (nunca falha em silêncio)', async () => {
    const db = criarFakePrisma();
    semear(db.tabelas);
    const antes = copiaProfunda(db.tabelas);
    const payload = await exportarTudo(db.client, DONO_TESTE);
    writeFileMock.mockRejectedValueOnce(new Error('ENOSPC: no space left on device'));

    await expect(
      importarTudo(db.client, JSON.parse(JSON.stringify(payload)), DONO_TESTE),
    ).rejects.toThrow(BackupSalvaguardaError);

    for (const nome of NOMES_TABELAS) {
      expect(db.tabelas[nome]).toEqual(antes[nome]);
    }
    expect(db.transacoesAbertas).toBe(0);
  });

  it('importa um backup versão 1 (sem pagamentosFixos) sem quebrar — compatibilidade retroativa', async () => {
    // O usuário pode ter gerado backups na v1 (antes de PagamentoFixo
    // existir) minutos antes desta mudança. Recusá-los o deixaria sem
    // conseguir restaurar o próprio backup — por isso version 1, mesmo sem
    // a chave `pagamentosFixos`, precisa continuar importável.
    const db = criarFakePrisma();
    semear(db.tabelas);

    const { backupCriado } = await importarTudo(db.client, {
      version: 1,
      dados: {
        config: comoArquivo([primeiraLinha(db.tabelas.config)])[0],
        contas: comoArquivo([...db.tabelas.conta]),
        categorias: comoArquivo([...db.tabelas.categoria]),
        custosFixos: comoArquivo([...db.tabelas.custoFixo]),
        provisoes: comoArquivo([...db.tabelas.provisaoAnual]),
        parcelamentos: comoArquivo([...db.tabelas.parcelamento]),
        ciclos: comoArquivo([...db.tabelas.ciclo]),
        // Sem `pagamentosFixos`: é exatamente o shape de um dump v1 real.
        transacoes: comoArquivo([...db.tabelas.transacao]),
        snapshots: comoArquivo(db.tabelas.snapshotPatrimonio).map((s) => ({
          ...s,
          itens: db.tabelas.itemPatrimonio.filter((i) => i.snapshotId === s.id),
        })),
      },
    }, DONO_TESTE);

    expect(backupCriado).toMatch(/data[\\/]app\.backup-.*\.json$/);
    expect(db.tabelas.pagamentoFixo).toEqual([]);
    expect(primeiraLinha(db.tabelas.ciclo).id).toBe('ciclo-julho');
  });

  it('importar um backup vazio zera o estado sem quebrar', async () => {
    const db = criarFakePrisma();
    semear(db.tabelas);

    await importarTudo(db.client, {
      version: 1,
      dados: {
        config: null,
        contas: [],
        categorias: [],
        custosFixos: [],
        provisoes: [],
        parcelamentos: [],
        ciclos: [],
        transacoes: [],
        snapshots: [],
      },
    }, DONO_TESTE);

    for (const nome of NOMES_TABELAS) {
      expect(db.tabelas[nome]).toEqual([]);
    }
  });

  it('o import é destrutivo: dados pré-existentes não sobrevivem ao restore', async () => {
    const db = criarFakePrisma();
    semear(db.tabelas);
    const payload = JSON.parse(JSON.stringify(await exportarTudo(db.client, DONO_TESTE)));

    db.tabelas.conta.push({
      id: 'conta-intrusa',
      nome: 'Lixo',
      tipo: 'VARIAVEL',
      saldoCents: 42,
      incluiPatrimonio: false,
      arquivada: false,
    });

    await importarTudo(db.client, payload, DONO_TESTE);

    expect(db.tabelas.conta.map((c) => c.id)).toEqual(['conta-reserva', 'conta-var']);
  });
});

describe('validação Zod do payload — import inválido é rejeitado sem corromper o estado', () => {
  const invalidos: ReadonlyArray<{ nome: string; payload: unknown }> = [
    { nome: 'null', payload: null },
    { nome: 'string', payload: 'não é backup' },
    { nome: 'objeto vazio', payload: {} },
    { nome: 'sem version', payload: { dados: { config: null, contas: [], categorias: [], custosFixos: [], provisoes: [], parcelamentos: [], ciclos: [], transacoes: [], snapshots: [] } } },
    { nome: 'version como string', payload: { version: '1', dados: { config: null, contas: [], categorias: [], custosFixos: [], provisoes: [], parcelamentos: [], ciclos: [], transacoes: [], snapshots: [] } } },
    { nome: 'sem dados', payload: { version: 1 } },
    { nome: 'coleção faltando (transacoes)', payload: { version: 1, dados: { config: null, contas: [], categorias: [], custosFixos: [], provisoes: [], parcelamentos: [], ciclos: [], snapshots: [] } } },
    { nome: 'coleção com tipo errado', payload: { version: 1, dados: { config: null, contas: 'muitas', categorias: [], custosFixos: [], provisoes: [], parcelamentos: [], ciclos: [], transacoes: [], snapshots: [] } } },
    { nome: 'array de escalares no lugar de linhas', payload: { version: 1, dados: { config: null, contas: [1, 2, 3], categorias: [], custosFixos: [], provisoes: [], parcelamentos: [], ciclos: [], transacoes: [], snapshots: [] } } },
  ];

  it.each(invalidos)('rejeita payload $nome e não apaga nada', async ({ payload }) => {
    // Arrange
    const db = criarFakePrisma();
    semear(db.tabelas);
    const antes = copiaProfunda(db.tabelas);

    // Act + Assert
    await expect(importarTudo(db.client, payload, DONO_TESTE)).rejects.toThrow();

    for (const nome of NOMES_TABELAS) {
      expect(db.tabelas[nome]).toEqual(antes[nome]);
    }
    // Rejeitou ANTES de abrir transação e ANTES de copiar o .db.
    expect(db.transacoesAbertas).toBe(0);
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('deve recusar um backup de versão futura desconhecida (acima do máximo suportado)', async () => {
    const db = criarFakePrisma();
    semear(db.tabelas);
    const antes = copiaProfunda(db.tabelas);

    await expect(
      importarTudo(db.client, {
        version: 999,
        dados: {
          config: null,
          contas: [],
          categorias: [],
          custosFixos: [],
          provisoes: [],
          parcelamentos: [],
          ciclos: [],
          transacoes: [],
          snapshots: [],
        },
      }, DONO_TESTE),
    ).rejects.toThrow(BackupVersaoIncompativelError);

    for (const nome of NOMES_TABELAS) {
      expect(db.tabelas[nome]).toEqual(antes[nome]);
    }
    // Rejeitou ANTES de abrir transação e ANTES de copiar o .db.
    expect(db.transacoesAbertas).toBe(0);
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('deve recusar um backup abaixo do piso de compatibilidade (version 0)', async () => {
    const db = criarFakePrisma();
    semear(db.tabelas);
    const antes = copiaProfunda(db.tabelas);

    await expect(
      importarTudo(db.client, {
        version: 0,
        dados: {
          config: null,
          contas: [],
          categorias: [],
          custosFixos: [],
          provisoes: [],
          parcelamentos: [],
          ciclos: [],
          transacoes: [],
          snapshots: [],
        },
      }, DONO_TESTE),
    ).rejects.toThrow(/versão/i);

    for (const nome of NOMES_TABELAS) {
      expect(db.tabelas[nome]).toEqual(antes[nome]);
    }
    expect(db.transacoesAbertas).toBe(0);
    expect(writeFileMock).not.toHaveBeenCalled();
  });
});

/**
 * V2 do plano TASKS-AUTH: antes, cada registro era validado como
 * `z.record(z.string(), z.unknown())` e ia ao Prisma com `as never` — qualquer
 * chave passava. Estes testes provam que o schema estrito fechou o buraco.
 */
describe('mass-assignment (TASKS-AUTH V2): schema estrito por tabela', () => {
  /** Backup mínimo válido; o teste injeta o veneno em cima. */
  function backupValido() {
    return {
      version: BACKUP_VERSION,
      dados: {
        config: null,
        contas: [
          { id: 'c1', nome: 'Nubank', tipo: 'VARIAVEL', saldoCents: 100, incluiPatrimonio: true, arquivada: false },
        ],
        categorias: [],
        custosFixos: [],
        provisoes: [],
        parcelamentos: [],
        ciclos: [],
        pagamentosFixos: [],
        transacoes: [],
        snapshots: [],
      },
    };
  }

  it('aceita um backup legítimo (a defesa não quebrou o caminho feliz)', async () => {
    const db = criarFakePrisma();
    await expect(importarTudo(db.client, backupValido(), DONO_TESTE)).resolves.toBeTruthy();
    expect(db.tabelas.conta).toHaveLength(1);
  });

  it('rejeita campo desconhecido numa conta e não escreve nada', async () => {
    const db = criarFakePrisma();
    const payload = backupValido();
    (payload.dados.contas[0] as Record<string, unknown>).campoInventado = 'veneno';

    await expect(importarTudo(db.client, payload, DONO_TESTE)).rejects.toThrow();
    for (const nome of NOMES_TABELAS) {
      expect(db.tabelas[nome]).toEqual([]);
    }
    // Nem a salvaguarda chegou a ser gravada: a validação falha antes.
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('rejeita valor monetário fracionário (regra de centavos Int)', async () => {
    const db = criarFakePrisma();
    const payload = backupValido();
    (payload.dados.contas[0] as Record<string, unknown>).saldoCents = 10.5;

    await expect(importarTudo(db.client, payload, DONO_TESTE)).rejects.toThrow();
    expect(db.tabelas.conta).toEqual([]);
  });

  it('rejeita data civil fora do formato "YYYY-MM-DD"', async () => {
    const db = criarFakePrisma();
    const payload = backupValido();
    payload.dados.ciclos = [
      {
        id: 'ciclo-1',
        dataInicio: '05/07/2026', // formato brasileiro — não é data civil ISO
        dataFim: '2026-08-04',
        rendaPrevistaCents: 1,
        rendaRealizadaCents: null,
        poupancaAlvoCents: 1,
        fixosCents: 1,
        provisaoMensalCents: 1,
        verbaVariavelCents: 1,
        rolloverRecebidoCents: 0,
        fechado: false,
        fechadoEm: null,
        sobraCents: null,
        observacao: null,
      },
    ] as never;

    await expect(importarTudo(db.client, payload, DONO_TESTE)).rejects.toThrow();
    expect(db.tabelas.ciclo).toEqual([]);
  });

  it('rejeita campo desconhecido dentro de um item de snapshot (nível aninhado)', async () => {
    const db = criarFakePrisma();
    const payload = backupValido();
    payload.dados.snapshots = [
      {
        id: 's1',
        data: '2026-08-01',
        totalCents: 100,
        itens: [{ id: 'i1', snapshotId: 's1', nome: 'CDB', classe: 'RENDA_FIXA', valorCents: 100, extra: 'x' }],
      },
    ] as never;

    await expect(importarTudo(db.client, payload, DONO_TESTE)).rejects.toThrow();
    expect(db.tabelas.snapshotPatrimonio).toEqual([]);
  });
});

/**
 * Saneamento de arestas no import (G0).
 *
 * `sanearArestas` é a ÚNICA defesa contra uma aresta do arquivo apontar para
 * fora dele — para um id que não existe (a FK abortaria o import DEPOIS de os
 * dados atuais já terem sido apagados) ou, pior, para o id de OUTRO DONO (a FK
 * aceitaria, e a aresta nasceria cruzando donos — TASKS-GRAFO §7.2). Ela é
 * exercitada aqui pela porta pública `importarTudo`, com o fake simulando as
 * mesmas FKs do Postgres: se o saneamento sumir, estes testes falham com
 * `ViolacaoDeChaveEstrangeiraSimulada` em vez de passarem em silêncio.
 */
describe('sanearArestas: aresta que aponta para fora do arquivo', () => {
  /** Arquivo legítimo e completo, no shape exato de um .json exportado. */
  async function arquivoDe(db: FakePrisma): Promise<{ version: number; dados: Linha }> {
    const payload = await exportarTudo(db.client, DONO_TESTE);
    return JSON.parse(JSON.stringify(payload)) as { version: number; dados: Linha };
  }

  function linhas(dados: Linha, colecao: string): Linha[] {
    return dados[colecao] as Linha[];
  }

  it('(a) referência opcional a um id ausente vira null, e o resto do arquivo importa', async () => {
    const db = criarFakePrisma();
    semear(db.tabelas);
    const arquivo = await arquivoDe(db);
    // Id que não está no arquivo: ou não existe, ou é de outro dono.
    for (const tx of linhas(arquivo.dados, 'transacoes')) tx.categoriaId = 'cat-de-outro-dono';
    zerar(db.tabelas);

    await expect(importarTudo(db.client, arquivo, DONO_TESTE)).resolves.toBeTruthy();

    for (const tx of db.tabelas.transacao) expect(tx.categoriaId).toBeNull();
    // O resto do payload não foi punido pela aresta podre.
    expect(db.tabelas.transacao).toHaveLength(2);
    expect(db.tabelas.categoria).toHaveLength(1);
    expect(primeiraLinha(db.tabelas.ciclo).id).toBe('ciclo-julho');
  });

  it('(b) pagamentoFixo com custoFixoId ausente é descartado, sem abortar o import', async () => {
    const db = criarFakePrisma();
    semear(db.tabelas);
    const arquivo = await arquivoDe(db);
    linhas(arquivo.dados, 'pagamentosFixos').push({
      id: 'pag-fantasma',
      custoFixoId: 'fixo-de-outro-dono',
      cicloId: 'ciclo-julho',
      pagoEm: '2026-07-09',
    });
    zerar(db.tabelas);

    await expect(importarTudo(db.client, arquivo, DONO_TESTE)).resolves.toBeTruthy();

    // A referência é OBRIGATÓRIA: anular não é opção, então a linha some — mas
    // sozinha, sem levar o pagamento legítimo junto.
    expect(db.tabelas.pagamentoFixo.map((p) => p.id)).toEqual(['pag-aluguel-julho']);
  });

  it('(c) arquivo legítimo faz round-trip idêntico — o saneamento não destrói dado válido', async () => {
    const db = criarFakePrisma();
    semear(db.tabelas);
    const esperado = copiaProfunda(db.tabelas);
    const arquivo = await arquivoDe(db);
    zerar(db.tabelas);

    await importarTudo(db.client, arquivo, DONO_TESTE);

    for (const nome of NOMES_TABELAS) {
      expect(db.tabelas[nome]).toEqual(esperado[nome]);
    }
  });
});

/**
 * Auto-relações: estar no arquivo não basta.
 *
 * `Ciclo.cicloAnteriorId` e `Transacao.estornoDeId` apontam para a própria
 * tabela, e o Postgres checa FK em trigger AFTER ROW — um arquivo com
 * `{"id":"c1","cicloAnteriorId":"c1"}` entra sem reclamar e cria um laço.
 * Inerte hoje (ninguém caminha a cadeia), fatal na CTE recursiva planejada
 * para a G1, onde o defeito é silencioso e se multiplica (TASKS-GRAFO §7.3).
 */
describe('sanearArestas: auto-relações (laço na cadeia)', () => {
  function cicloArquivo(over: Linha): Linha {
    return {
      id: 'ciclo-x',
      dataInicio: '2026-07-05',
      dataFim: '2026-08-04',
      rendaPrevistaCents: 1,
      rendaRealizadaCents: null,
      poupancaAlvoCents: 1,
      fixosCents: 1,
      provisaoMensalCents: 1,
      verbaVariavelCents: 1,
      rolloverRecebidoCents: 0,
      fechado: false,
      fechadoEm: null,
      sobraCents: null,
      observacao: null,
      cicloAnteriorId: null,
      ...over,
    };
  }

  function transacaoArquivo(over: Linha): Linha {
    return {
      id: 'tx-x',
      data: '2026-07-10',
      valorCents: 100,
      tipo: 'DESPESA',
      descricao: null,
      metodo: null,
      categoriaId: null,
      contaId: null,
      contaDestinoId: null,
      provisaoId: null,
      parcelamentoId: null,
      parcelaNum: null,
      estornoDeId: null,
      cicloId: null,
      pagoEm: null,
      ...over,
    };
  }

  function arquivoCom(dados: Partial<Record<string, unknown>>) {
    return {
      version: BACKUP_VERSION,
      dados: {
        config: null,
        contas: [],
        categorias: [],
        custosFixos: [],
        provisoes: [],
        parcelamentos: [],
        ciclos: [],
        pagamentosFixos: [],
        transacoes: [],
        snapshots: [],
        memorias: [],
        ...dados,
      },
    };
  }

  it('ciclo que aponta para si mesmo perde a aresta', async () => {
    const db = criarFakePrisma();

    await importarTudo(
      db.client,
      arquivoCom({ ciclos: [cicloArquivo({ id: 'c1', cicloAnteriorId: 'c1' })] }),
      DONO_TESTE,
    );

    expect(primeiraLinha(db.tabelas.ciclo).cicloAnteriorId).toBeNull();
  });

  it('ciclo mútuo (c3 -> c5 -> c3) é quebrado: só a aresta cronológica sobrevive', async () => {
    const db = criarFakePrisma();

    await importarTudo(
      db.client,
      arquivoCom({
        ciclos: [
          cicloArquivo({ id: 'c3', dataInicio: '2026-03-01', dataFim: '2026-03-31', cicloAnteriorId: 'c5' }),
          cicloArquivo({ id: 'c5', dataInicio: '2026-05-01', dataFim: '2026-05-31', cicloAnteriorId: 'c3' }),
        ],
      }),
      DONO_TESTE,
    );

    const porId = new Map(db.tabelas.ciclo.map((c) => [c.id, c]));
    // c3 começou ANTES de c5: "c3 veio depois de c5" é inversão, não cadeia.
    expect(porId.get('c3')?.cicloAnteriorId).toBeNull();
    // c5 -> c3 respeita o invariante e é preservado.
    expect(porId.get('c5')?.cicloAnteriorId).toBe('c3');
  });

  it('transação que estorna a si mesma perde a aresta', async () => {
    const db = criarFakePrisma();

    await importarTudo(
      db.client,
      arquivoCom({ transacoes: [transacaoArquivo({ id: 't1', estornoDeId: 't1' })] }),
      DONO_TESTE,
    );

    expect(primeiraLinha(db.tabelas.transacao).estornoDeId).toBeNull();
  });
});

/**
 * Memória do copiloto no backup (Fase E, tarefa E8 — BACKUP_VERSION 3).
 *
 * O ciclo de aceite da E8: export -> limpar -> import -> estado idêntico.
 */
describe('memória do copiloto (BACKUP_VERSION 3)', () => {
  it('exporta as memórias, ativas e arquivadas, sem o vetor', async () => {
    const db = criarFakePrisma();
    semear(db.tabelas);

    const payload = (await exportarTudo(db.client, DONO_TESTE)) as {
      dados: { memorias: Record<string, unknown>[] };
    };

    expect(payload.dados.memorias).toHaveLength(2);
    // Arquivada também vai: ela é histórico do que o copiloto já soube.
    expect(payload.dados.memorias.map((m) => m.ativo).sort()).toEqual([false, true]);
    // O vetor NÃO viaja: são 1536 floats por memória, e é recomputável.
    for (const memoria of payload.dados.memorias) {
      expect(memoria).not.toHaveProperty('embedding');
      // `donoId` nunca sai no arquivo (backup é portátil).
      expect(memoria).not.toHaveProperty('donoId');
    }
  });

  it('round-trip: export -> zerado -> import devolve as memórias idênticas', async () => {
    const origem = criarFakePrisma();
    semear(origem.tabelas);
    const payload = await exportarTudo(origem.client, DONO_TESTE);

    const destino = criarFakePrisma();
    await importarTudo(destino.client, payload, DONO_TESTE);

    const restauradas = destino.tabelas.memoria;
    expect(restauradas).toHaveLength(2);

    const plano = restauradas.find((m) => m.id === 'mem-1');
    expect(plano?.texto).toBe('quer sair do aluguel até 2028');
    expect(plano?.tipo).toBe('PLANO');
    expect(plano?.origem).toBe('USUARIO');
    // Recarimbada com o dono de quem importou, nunca com nada vindo do arquivo.
    expect(plano?.donoId).toBe(DONO_TESTE);
  });

  it('🔴 memória restaurada não carrega valor monetário nenhum', async () => {
    const origem = criarFakePrisma();
    semear(origem.tabelas);

    const payload = (await exportarTudo(origem.client, DONO_TESTE)) as {
      dados: { memorias: Record<string, unknown>[] };
    };

    // A guarda de escrita (validarTextoMemoria) impede o valor de entrar; este
    // teste garante que o backup não é um caminho lateral de volta.
    for (const memoria of payload.dados.memorias) {
      expect(contemValorMonetario(String(memoria.texto))).toBe(false);
      expect(Object.keys(memoria).some((k) => k.endsWith('Cents'))).toBe(false);
    }
  });

  it('importa backup versão 2 (sem a chave memorias) sem quebrar', async () => {
    const origem = criarFakePrisma();
    semear(origem.tabelas);
    const payload = (await exportarTudo(origem.client, DONO_TESTE)) as {
      version: number;
      dados: Record<string, unknown>;
    };

    // Simula um arquivo gerado antes da Fase E existir.
    const antigo = {
      ...payload,
      version: 2,
      dados: { ...payload.dados, memorias: undefined },
    };
    delete (antigo.dados as Record<string, unknown>).memorias;

    const destino = criarFakePrisma();
    await expect(importarTudo(destino.client, antigo, DONO_TESTE)).resolves.toBeDefined();
    expect(destino.tabelas.memoria).toHaveLength(0);
  });
});

/**
 * Importação de fatura (I1, BACKUP_VERSION 4).
 *
 * A decisão de 25/08/2026 (§14 premissa 5 do TASKS-IMPORTACAO) é que **só a
 * importação CONFIRMADA viaja**: rascunho e descartada são estado de tela, não
 * fato financeiro. Ela viaja porque `Transacao.itemImportadoId` aponta para
 * dentro dela — sem os itens no arquivo, ou a FK quebraria o import, ou o
 * caminho de volta que torna uma importação reversível morreria no restore.
 */
describe('importação de fatura no backup (BACKUP_VERSION 4)', () => {
  /** Uma transação que nasceu da linha `item-imp-1` semeada por `semear`. */
  function transacaoImportada(): Linha {
    return {
      id: 'tx-importada',
      donoId: DONO_TESTE,
      data: '2026-08-03',
      valorCents: 4_599,
      tipo: 'DESPESA',
      descricao: 'MERCADO XYZ',
      metodo: 'CREDITO',
      categoriaId: 'cat-mercado',
      contaId: 'conta-var',
      contaDestinoId: null,
      provisaoId: null,
      parcelamentoId: null,
      parcelaNum: null,
      estornoDeId: null,
      cicloId: 'ciclo-julho',
      pagoEm: null,
      origem: 'IMPORTACAO',
      itemImportadoId: 'item-imp-1',
    };
  }

  it('exporta a importação confirmada com os itens dentro', async () => {
    const db = criarFakePrisma();
    semear(db.tabelas);

    const payload = (await exportarTudo(db.client, DONO_TESTE)) as {
      dados: { importacoes: { id: string; itens: Linha[] }[] };
    };

    expect(payload.dados.importacoes).toHaveLength(1);
    const [imp] = payload.dados.importacoes;
    expect(imp?.id).toBe('imp-confirmada');
    expect(imp?.itens).toHaveLength(1);
    expect(imp?.itens[0]?.descricaoOriginal).toBe('MERCADO XYZ 03/08');
    // O dono não viaja em NENHUM nível — nem no cabeçalho, nem no item.
    expect(JSON.stringify(payload.dados.importacoes)).not.toContain('donoId');
  });

  it('NÃO exporta rascunho nem importação descartada', async () => {
    const db = criarFakePrisma();
    semear(db.tabelas);
    db.tabelas.importacao.push(
      {
        id: 'imp-rascunho',
        donoId: DONO_TESTE,
        origem: 'TEXTO_COLADO',
        nomeArquivo: null,
        hashConteudo: 'sha256-rascunho',
        competenciaRef: '2026-08',
        status: 'RASCUNHO',
        tokensEntrada: 0,
        tokensSaida: 0,
        criadaEm: '2026-08-07T09:00:00.000Z',
        confirmadaEm: null,
      },
      {
        id: 'imp-descartada',
        donoId: DONO_TESTE,
        origem: 'PDF',
        nomeArquivo: 'errada.pdf',
        hashConteudo: 'sha256-descartada',
        competenciaRef: '2026-07',
        status: 'DESCARTADA',
        tokensEntrada: 10,
        tokensSaida: 2,
        criadaEm: '2026-07-07T09:00:00.000Z',
        confirmadaEm: null,
      },
    );

    const dump = JSON.stringify(await exportarTudo(db.client, DONO_TESTE));

    expect(dump).toContain('imp-confirmada');
    expect(dump).not.toContain('imp-rascunho');
    expect(dump).not.toContain('imp-descartada');
  });

  it('round-trip preserva origem, itemImportadoId e o item que a originou', async () => {
    const db = criarFakePrisma();
    semear(db.tabelas);
    db.tabelas.transacao.push(transacaoImportada());

    const payload = await exportarTudo(db.client, DONO_TESTE);
    zerar(db.tabelas);
    await importarTudo(db.client, JSON.parse(JSON.stringify(payload)), DONO_TESTE);

    const restaurada = db.tabelas.transacao.find((t) => t.id === 'tx-importada');
    expect(restaurada?.origem).toBe('IMPORTACAO');
    expect(restaurada?.itemImportadoId).toBe('item-imp-1');
    // O item existe DE VERDADE do outro lado — a FK não sobreviveu por acaso.
    expect(db.tabelas.itemImportado.map((i) => i.id)).toEqual(['item-imp-1']);
    expect(db.tabelas.itemImportado[0]?.importacaoId).toBe('imp-confirmada');
    // E todo mundo nasceu carimbado com o dono de quem importou.
    expect(db.tabelas.importacao[0]?.donoId).toBe(DONO_TESTE);
    expect(db.tabelas.itemImportado[0]?.donoId).toBe(DONO_TESTE);
  });

  it('duas transações reivindicando o mesmo item: a segunda perde a referência, não o dinheiro', async () => {
    // `Transacao.itemImportadoId` é @unique no banco (§11, camada 2): duas
    // linhas apontando para o mesmo item abortariam o import DEPOIS de apagar
    // os dados atuais. `sanearArestas` degrada a segunda em vez de explodir.
    const db = criarFakePrisma();
    semear(db.tabelas);
    db.tabelas.transacao.push(transacaoImportada(), {
      ...transacaoImportada(),
      id: 'tx-importada-duplicada',
      valorCents: 1_111,
    });

    const payload = await exportarTudo(db.client, DONO_TESTE);
    zerar(db.tabelas);
    await importarTudo(db.client, JSON.parse(JSON.stringify(payload)), DONO_TESTE);

    const comItem = db.tabelas.transacao.filter((t) => t.itemImportadoId === 'item-imp-1');
    expect(comItem).toHaveLength(1);
    const segunda = db.tabelas.transacao.find((t) => t.id === 'tx-importada-duplicada');
    expect(segunda?.itemImportadoId).toBeNull();
    // Perdeu o rastro, NÃO o dinheiro — e continua dizendo que veio de import.
    expect(segunda?.valorCents).toBe(1_111);
    expect(segunda?.origem).toBe('IMPORTACAO');
  });

  it('transação que aponta para um item ausente do arquivo importa sem a referência', async () => {
    const db = criarFakePrisma();
    semear(db.tabelas);
    db.tabelas.transacao.push({ ...transacaoImportada(), itemImportadoId: 'item-de-outro-dono' });

    const payload = await exportarTudo(db.client, DONO_TESTE);
    zerar(db.tabelas);
    await expect(
      importarTudo(db.client, JSON.parse(JSON.stringify(payload)), DONO_TESTE),
    ).resolves.toBeDefined();

    expect(db.tabelas.transacao.find((t) => t.id === 'tx-importada')?.itemImportadoId).toBeNull();
  });

  it('recarimba o importacaoId do item a partir do PAI, ignorando o que o arquivo disser', async () => {
    // Num arquivo editado à mão, o item pode dizer que pertence a outra
    // importação (ou à de outro dono). A aresta nasce da estrutura do JSON.
    const db = criarFakePrisma();
    semear(db.tabelas);
    const payload = (await exportarTudo(db.client, DONO_TESTE)) as {
      version: number;
      dados: { importacoes: { itens: Linha[] }[] };
    };
    const adulterado = JSON.parse(JSON.stringify(payload)) as typeof payload;
    const item = adulterado.dados.importacoes[0]?.itens[0];
    if (!item) throw new Error('item de importação ausente no payload');
    item.importacaoId = 'imp-de-outro-dono';

    zerar(db.tabelas);
    await importarTudo(db.client, adulterado, DONO_TESTE);

    expect(db.tabelas.itemImportado[0]?.importacaoId).toBe('imp-confirmada');
  });

  it('importa backup versão 3 (sem a chave importacoes) sem quebrar', async () => {
    const origem = criarFakePrisma();
    semear(origem.tabelas);
    const payload = (await exportarTudo(origem.client, DONO_TESTE)) as {
      version: number;
      dados: Record<string, unknown>;
    };

    const antigo = { ...payload, version: 3, dados: { ...payload.dados } };
    delete antigo.dados.importacoes;

    const destino = criarFakePrisma();
    await expect(importarTudo(destino.client, antigo, DONO_TESTE)).resolves.toBeDefined();
    expect(destino.tabelas.importacao).toHaveLength(0);
    expect(destino.tabelas.itemImportado).toHaveLength(0);
  });
});
