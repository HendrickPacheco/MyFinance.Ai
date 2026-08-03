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
import { exportarTudo, importarTudo, BACKUP_VERSION, BackupSalvaguardaError } from './backup';

vi.mock('node:fs', () => ({
  promises: { mkdir: vi.fn(async () => undefined), writeFile: vi.fn(async () => undefined) },
}));

const mkdirMock = vi.mocked(fs.mkdir);
const writeFileMock = vi.mocked(fs.writeFile);

type Linha = Record<string, unknown>;

const NOMES_TABELAS = [
  'config',
  'conta',
  'categoria',
  'custoFixo',
  'provisaoAnual',
  'parcelamento',
  'ciclo',
  'transacao',
  'snapshotPatrimonio',
  'itemPatrimonio',
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

function criarFakePrisma(): FakePrisma {
  const tabelas: Tabelas = {
    config: [],
    conta: [],
    categoria: [],
    custoFixo: [],
    provisaoAnual: [],
    parcelamento: [],
    ciclo: [],
    transacao: [],
    snapshotPatrimonio: [],
    itemPatrimonio: [],
  };
  const estado = { transacoesAbertas: 0, ordemInsercaoTransacao: [] as string[] };

  function delegate(nome: NomeTabela) {
    return {
      findMany: async (args?: { include?: { itens?: boolean } }): Promise<Linha[]> => {
        const linhas = tabelas[nome].map((l) => ({ ...l }));
        if (nome === 'snapshotPatrimonio' && args?.include?.itens) {
          return linhas.map((s) => ({
            ...s,
            itens: tabelas.itemPatrimonio
              .filter((i) => i.snapshotId === s.id)
              .map((i) => ({ ...i })),
          }));
        }
        return linhas;
      },
      findUnique: async (args: { where: { id: unknown } }): Promise<Linha | null> => {
        const achado = tabelas[nome].find((l) => l.id === args.where.id);
        return achado ? { ...achado } : null;
      },
      create: async (args: { data: Linha }): Promise<Linha> => {
        const linha = { ...args.data };
        tabelas[nome].push(linha);
        return linha;
      },
      createMany: async (args: { data: Linha[] }): Promise<{ count: number }> => {
        for (const l of args.data) {
          tabelas[nome].push({ ...l });
          if (nome === 'transacao') estado.ordemInsercaoTransacao.push(String(l.id));
        }
        return { count: args.data.length };
      },
      deleteMany: async (): Promise<{ count: number }> => {
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
    },
  );
  tabelas.snapshotPatrimonio.push({ id: 'snap-1', data: '2026-08-05', totalCents: 1_234_568 });
  tabelas.itemPatrimonio.push(
    { id: 'item-1', snapshotId: 'snap-1', nome: 'Reserva', classe: 'CONTA', valorCents: 1_234_567 },
    { id: 'item-2', snapshotId: 'snap-1', nome: 'Bitcoin', classe: 'CRIPTO', valorCents: 1 },
  );
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

    const payload = (await exportarTudo(db.client)) as {
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
        'parcelamentos',
        'provisoes',
        'snapshots',
        'transacoes',
      ].sort(),
    );
  });

  it('exporta os itens do snapshot aninhados', async () => {
    const db = criarFakePrisma();
    semear(db.tabelas);

    const payload = (await exportarTudo(db.client)) as {
      dados: { snapshots: Array<{ id: string; itens: Array<{ valorCents: number }> }> };
    };

    expect(payload.dados.snapshots).toHaveLength(1);
    const snapshot = payload.dados.snapshots[0];
    expect(snapshot?.itens).toHaveLength(2);
    expect(snapshot?.itens.map((i) => i.valorCents)).toEqual([1_234_567, 1]);
  });

  it('base vazia exporta config null e coleções vazias', async () => {
    const db = criarFakePrisma();

    const payload = (await exportarTudo(db.client)) as {
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
    const payload = await exportarTudo(db.client);
    const arquivo: unknown = JSON.parse(JSON.stringify(payload));
    zerar(db.tabelas);
    expect(db.tabelas.transacao).toEqual([]);

    const { backupCriado } = await importarTudo(db.client, arquivo);

    // Assert: estado idêntico, tabela por tabela.
    for (const nome of NOMES_TABELAS) {
      expect(db.tabelas[nome]).toEqual(esperado[nome]);
    }
    expect(backupCriado).toMatch(/data[\\/]app\.backup-.*\.json$/);
  });

  it('preserva os valores monetários como Int em centavos (sem float)', async () => {
    const db = criarFakePrisma();
    semear(db.tabelas);

    const payload = await exportarTudo(db.client);
    zerar(db.tabelas);
    await importarTudo(db.client, JSON.parse(JSON.stringify(payload)));

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

    const payload = await exportarTudo(db.client);
    zerar(db.tabelas);
    await importarTudo(db.client, JSON.parse(JSON.stringify(payload)));

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

    const payload = await exportarTudo(db.client);
    zerar(db.tabelas);
    await importarTudo(db.client, JSON.parse(JSON.stringify(payload)));

    expect(db.ordemInsercaoTransacao).toEqual(['tx-original', 'tx-estorno']);
  });

  it('grava a salvaguarda em JSON (./data) ANTES de qualquer escrita destrutiva', async () => {
    const db = criarFakePrisma();
    semear(db.tabelas);
    const payload = await exportarTudo(db.client);

    await importarTudo(db.client, JSON.parse(JSON.stringify(payload)));

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
    const payload = await exportarTudo(db.client);
    writeFileMock.mockRejectedValueOnce(new Error('ENOSPC: no space left on device'));

    await expect(
      importarTudo(db.client, JSON.parse(JSON.stringify(payload))),
    ).rejects.toThrow(BackupSalvaguardaError);

    for (const nome of NOMES_TABELAS) {
      expect(db.tabelas[nome]).toEqual(antes[nome]);
    }
    expect(db.transacoesAbertas).toBe(0);
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
    });

    for (const nome of NOMES_TABELAS) {
      expect(db.tabelas[nome]).toEqual([]);
    }
  });

  it('o import é destrutivo: dados pré-existentes não sobrevivem ao restore', async () => {
    const db = criarFakePrisma();
    semear(db.tabelas);
    const payload = JSON.parse(JSON.stringify(await exportarTudo(db.client)));

    db.tabelas.conta.push({
      id: 'conta-intrusa',
      nome: 'Lixo',
      tipo: 'VARIAVEL',
      saldoCents: 42,
      incluiPatrimonio: false,
      arquivada: false,
    });

    await importarTudo(db.client, payload);

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
    await expect(importarTudo(db.client, payload)).rejects.toThrow();

    for (const nome of NOMES_TABELAS) {
      expect(db.tabelas[nome]).toEqual(antes[nome]);
    }
    // Rejeitou ANTES de abrir transação e ANTES de copiar o .db.
    expect(db.transacoesAbertas).toBe(0);
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('deve recusar um backup de versão incompatível', async () => {
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
      }),
    ).rejects.toThrow(/versão/i);

    for (const nome of NOMES_TABELAS) {
      expect(db.tabelas[nome]).toEqual(antes[nome]);
    }
    // Rejeitou ANTES de abrir transação e ANTES de copiar o .db.
    expect(db.transacoesAbertas).toBe(0);
    expect(writeFileMock).not.toHaveBeenCalled();
  });
});
