/**
 * Testes do read-model de simulação de renda hipotética (caso real
 * 11/08/2026). O que estes testes existem para proteger:
 *  1. o congelamento (SPEC 5.2): a hipótese de renda NUNCA reescreve o ciclo
 *     em curso — `cicloAtualCongelado` e o primeiro `CicloSimulacaoRenda`
 *     precisam declarar isso, não deixar implícito;
 *  2. leitura pura: nenhuma escrita, nenhum ciclo criado.
 */
import { describe, expect, it } from 'vitest';
import type { CustoFixo } from '@/domain/model/entidades';
import {
  criarDeps,
  cicloFake,
  CONFIG_PADRAO,
  type FakeDeps,
} from './__fakes__/fakes-ciclo-fechamento';
import { obterSimulacaoRenda } from './renda-hipotetica';

const HOJE = '2026-07-20';

/** Config vigente com os números reais do dono: renda 30k, meta 18k. Os
 * ciclos FUTUROS (não o congelado) usam esta config — ver
 * `application/projecao.ts`, `parametrosVigentes`. */
const CONFIG_DONO = {
  ...CONFIG_PADRAO,
  rendaBaseCents: 3_000_000,
  metaPoupancaCents: 1_800_000,
};

/** Custo fixo único somando os 4.884 dos fixos reais do dono — é o que
 * `custosFixos.listarAtivos()` devolve para compor `fixosCents` dos ciclos
 * que ainda não nasceram. */
function custoFixoDono(): CustoFixo {
  return {
    id: 'cf-dono',
    nome: 'Fixos consolidados',
    valorCents: 488_400,
    diaVencimento: 10,
    ativo: true,
    contaId: null,
    categoriaId: null,
    vigenteDe: null,
    vigenteAte: null,
  };
}

/** Ciclo atual congelado cobrindo HOJE (diaRecebimento 5 da CONFIG_PADRAO),
 * com os números reais do dono: renda 30k, meta 18k, fixos 4.884. */
function cicloAtualFake() {
  return cicloFake({
    id: 'ciclo-atual',
    dataInicio: '2026-07-05',
    dataFim: '2026-08-04',
    rendaPrevistaCents: 3_000_000,
    poupancaAlvoCents: 1_800_000,
    fixosCents: 488_400,
    provisaoMensalCents: 0,
    verbaVariavelCents: 711_600,
    rolloverRecebidoCents: 0,
  });
}

function fotografar(deps: FakeDeps): string {
  return JSON.stringify({ ciclos: deps.ciclos.itens, transacoes: deps.transacoes.itens });
}

describe('obterSimulacaoRenda — congelamento do ciclo atual (SPEC 5.2)', () => {
  it('cicloAtualCongelado é true e o primeiro ciclo mantém a renda REAL, não a hipotética', async () => {
    const deps = criarDeps({ hoje: HOJE, ciclos: [cicloAtualFake()] });

    const resultado = await obterSimulacaoRenda(deps, {
      rendaHipoteticaCents: 1_500_000,
      numCiclos: 3,
    });

    expect(resultado.cicloAtualCongelado).toBe(true);
    expect(resultado.ciclos[0]?.hipotetico.rendaPrevistaCents).toBe(3_000_000);
    expect(resultado.ciclos[0]?.hipotetico.verbaVariavelCents).toBe(711_600);
  });

  it('os ciclos seguintes usam a renda hipotética, e a meta deixa de caber', async () => {
    const deps = criarDeps({
      hoje: HOJE,
      ciclos: [cicloAtualFake()],
      config: CONFIG_DONO,
      custosFixos: [custoFixoDono()],
    });

    const resultado = await obterSimulacaoRenda(deps, {
      rendaHipoteticaCents: 1_500_000,
      numCiclos: 3,
    });

    const segundo = resultado.ciclos[1];
    expect(segundo?.hipotetico.rendaPrevistaCents).toBe(1_500_000);
    expect(segundo?.avaliacao.metaPoupancaCabeNaRenda).toBe(false);
    expect(segundo?.avaliacao.motivoMetaNaoCabe).not.toBeNull();
  });

  it('sem ciclo aberto, cicloAtualCongelado é false e o primeiro ciclo já usa a hipótese', async () => {
    const deps = criarDeps({ hoje: HOJE, ciclos: [] });

    const resultado = await obterSimulacaoRenda(deps, {
      rendaHipoteticaCents: 1_500_000,
      numCiclos: 2,
    });

    expect(resultado.cicloAtualCongelado).toBe(false);
    expect(resultado.ciclos[0]?.hipotetico.rendaPrevistaCents).toBe(1_500_000);
  });
});

describe('obterSimulacaoRenda — sobra após comprometidos com os números reais do dono', () => {
  it('renda 15.000, fixos 4.884, sem parcela: sobra é renda menos fixos', async () => {
    const deps = criarDeps({
      hoje: HOJE,
      ciclos: [cicloAtualFake()],
      config: CONFIG_DONO,
      custosFixos: [custoFixoDono()],
    });

    const resultado = await obterSimulacaoRenda(deps, {
      rendaHipoteticaCents: 1_500_000,
      numCiclos: 2,
    });

    const segundo = resultado.ciclos[1];
    // 1.500.000 - 488.400 (sem parcela cadastrada nos fakes) = 1.011.600.
    expect(segundo?.avaliacao.comprometidoMensalCents).toBe(488_400);
    expect(segundo?.avaliacao.sobraAposComprometidosCents).toBe(1_011_600);
  });
});

describe('obterSimulacaoRenda — horizonte', () => {
  it('numCiclos null usa o padrão de 6 ciclos', async () => {
    const deps = criarDeps({ hoje: HOJE, ciclos: [cicloAtualFake()] });

    const resultado = await obterSimulacaoRenda(deps, {
      rendaHipoteticaCents: 1_500_000,
      numCiclos: null,
    });

    expect(resultado.ciclos).toHaveLength(6);
  });
});

describe('obterSimulacaoRenda — contratos', () => {
  it('é read-only: não grava nada e não cria ciclo', async () => {
    const deps = criarDeps({ hoje: HOJE, ciclos: [cicloAtualFake()] });
    const antes = fotografar(deps);

    await obterSimulacaoRenda(deps, { rendaHipoteticaCents: 1_500_000, numCiclos: 3 });

    expect(fotografar(deps)).toBe(antes);
    expect(deps.ciclos.criarChamadas).toBe(0);
  });
});
