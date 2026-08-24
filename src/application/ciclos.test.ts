/**
 * Testes da camada de aplicação de ciclos (SPEC 5.2, 5.3, regra 10 e regra
 * inviolável 3 do CLAUDE.md).
 *
 * Tudo roda contra fakes em memória das portas — nenhum acesso ao banco real.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  garantirCicloAtual,
  recalcularCicloAtual,
  recalcularCicloAtualSeVazio,
  puxarDaReserva,
  ConfigAusenteError,
} from './ciclos';
import {
  criarDeps,
  primeiro,
  cicloFake,
  contaFake,
  provisaoFake,
  transacaoFake,
} from './__fakes__/fakes-ciclo-fechamento';
import { RelogioSistema } from '@/infrastructure/relogio/relogio-sistema';

describe('garantirCicloAtual — idempotência (chamada no layout a cada render)', () => {
  it('N chamadas criam exatamente 1 ciclo e devolvem sempre o mesmo id', async () => {
    // Arrange
    const deps = criarDeps({ hoje: '2026-07-20' });

    // Act
    const r1 = await garantirCicloAtual(deps);
    const r2 = await garantirCicloAtual(deps);
    const r3 = await garantirCicloAtual(deps);
    const r4 = await garantirCicloAtual(deps);
    const r5 = await garantirCicloAtual(deps);

    // Assert
    expect(deps.ciclos.criarChamadas).toBe(1);
    expect(deps.ciclos.itens).toHaveLength(1);
    expect([r2.ciclo.id, r3.ciclo.id, r4.ciclo.id, r5.ciclo.id]).toEqual([
      r1.ciclo.id,
      r1.ciclo.id,
      r1.ciclo.id,
      r1.ciclo.id,
    ]);
  });

  // Corrigido: `criarSeAusente` (constraint única em Ciclo.dataInicio +
  // recuperação de P2002) torna a criação atômica sob corrida — ver
  // src/domain/ports/repositorios.ts e src/infrastructure/repositories/prisma-repositories.ts.
  it('[BUG] chamadas concorrentes não devem duplicar o ciclo', async () => {
    const deps = criarDeps({ hoje: '2026-07-20' });

    await Promise.all([
      garantirCicloAtual(deps),
      garantirCicloAtual(deps),
      garantirCicloAtual(deps),
    ]);

    expect(deps.ciclos.itens).toHaveLength(1);
  });

  it('não cria nada quando já existe ciclo cobrindo hoje', async () => {
    const deps = criarDeps({
      hoje: '2026-07-20',
      ciclos: [cicloFake({ id: 'c1', dataInicio: '2026-07-05', dataFim: '2026-08-04' })],
    });

    const { ciclo } = await garantirCicloAtual(deps);

    expect(ciclo.id).toBe('c1');
    expect(deps.ciclos.criarChamadas).toBe(0);
  });

  it('lança ConfigAusenteError quando não há Config (instalação limpa)', async () => {
    const deps = criarDeps({ config: null });

    await expect(garantirCicloAtual(deps)).rejects.toBeInstanceOf(ConfigAusenteError);
  });

  it('vincula transações órfãs (parcelas futuras) ao ciclo recém-criado', async () => {
    const deps = criarDeps({
      hoje: '2026-07-20',
      transacoes: [
        transacaoFake({ id: 'tx-dentro', data: '2026-07-10', cicloId: null }),
        transacaoFake({ id: 'tx-fora', data: '2026-09-10', cicloId: null }),
      ],
    });

    const { ciclo } = await garantirCicloAtual(deps);

    const dentro = deps.transacoes.itens.find((t) => t.id === 'tx-dentro');
    const fora = deps.transacoes.itens.find((t) => t.id === 'tx-fora');
    expect(dentro?.cicloId).toBe(ciclo.id);
    expect(fora?.cicloId).toBeNull();
  });
});

describe('garantirCicloAtual — regra 10 (ciclo anterior não fechado nunca bloqueia)', () => {
  it('cria o novo ciclo automaticamente e sinaliza a pendência, sem lançar erro', async () => {
    // Arrange: ciclo de junho terminou em 04/07 e continua aberto.
    const anterior = cicloFake({
      id: 'c-junho',
      dataInicio: '2026-06-05',
      dataFim: '2026-07-04',
      fechado: false,
    });
    const deps = criarDeps({ hoje: '2026-07-20', ciclos: [anterior] });

    // Act
    const { ciclo, pendenciaFechamento } = await garantirCicloAtual(deps);

    // Assert
    expect(deps.ciclos.criarChamadas).toBe(1);
    expect(ciclo.dataInicio).toBe('2026-07-05');
    expect(ciclo.dataFim).toBe('2026-08-04');
    expect(ciclo.fechado).toBe(false);
    expect(pendenciaFechamento?.id).toBe('c-junho');
  });

  it('o novo ciclo nasce com os parâmetros VIGENTES da Config', async () => {
    const deps = criarDeps({
      hoje: '2026-07-20',
      ciclos: [cicloFake({ id: 'c-junho', dataInicio: '2026-06-05', dataFim: '2026-07-04' })],
      custosFixos: [
        {
          id: 'f1',
          nome: 'Aluguel',
          valorCents: 200_000,
          diaVencimento: 10,
          ativo: true,
          contaId: null,
          categoriaId: null,
          vigenteDe: null,
          vigenteAte: null,
        },
      ],
      provisoes: [provisaoFake({ id: 'p1', valorAnualCents: 120_000 })],
    });

    const { ciclo } = await garantirCicloAtual(deps);

    // renda 800000 − poupança 100000 − fixos 200000 − provisão 10000 = 490000
    expect(ciclo.rendaPrevistaCents).toBe(800_000);
    expect(ciclo.poupancaAlvoCents).toBe(100_000);
    expect(ciclo.fixosCents).toBe(200_000);
    expect(ciclo.provisaoMensalCents).toBe(10_000);
    expect(ciclo.verbaVariavelCents).toBe(490_000);
    expect(Number.isInteger(ciclo.verbaVariavelCents)).toBe(true);
  });

  it('não há pendência quando o ciclo anterior está fechado', async () => {
    const deps = criarDeps({
      hoje: '2026-07-20',
      ciclos: [
        cicloFake({
          id: 'c-junho',
          dataInicio: '2026-06-05',
          dataFim: '2026-07-04',
          fechado: true,
          fechadoEm: '2026-07-05',
          sobraCents: 0,
        }),
      ],
    });

    const { pendenciaFechamento } = await garantirCicloAtual(deps);

    expect(pendenciaFechamento).toBeNull();
  });

  it('não aponta o próprio ciclo como pendência quando não existe anterior', async () => {
    const deps = criarDeps({ hoje: '2026-07-20' });

    const { ciclo, pendenciaFechamento } = await garantirCicloAtual(deps);

    expect(pendenciaFechamento).toBeNull();
    expect(ciclo.id).not.toBe('');
  });
});

describe('garantirCicloAtual — rollover (decisão 5: sobra ± entra na verba seguinte)', () => {
  it('sobra POSITIVA do ciclo fechado entra na verba do próximo', async () => {
    const deps = criarDeps({
      hoje: '2026-07-20',
      ciclos: [
        cicloFake({
          id: 'c-junho',
          dataInicio: '2026-06-05',
          dataFim: '2026-07-04',
          fechado: true,
          fechadoEm: '2026-07-05',
          sobraCents: 50_000,
        }),
      ],
    });
    deps.config.mutar({ destinoSobra: 'ROLLOVER' });

    const { ciclo } = await garantirCicloAtual(deps);

    expect(ciclo.rolloverRecebidoCents).toBe(50_000);
    expect(ciclo.verbaVariavelCents).toBe(750_000); // 700000 + 50000
  });

  it('sobra NEGATIVA (déficit) também entra — reduzindo a verba do próximo', async () => {
    const deps = criarDeps({
      hoje: '2026-07-20',
      ciclos: [
        cicloFake({
          id: 'c-junho',
          dataInicio: '2026-06-05',
          dataFim: '2026-07-04',
          fechado: true,
          fechadoEm: '2026-07-05',
          sobraCents: -30_000,
        }),
      ],
    });
    deps.config.mutar({ destinoSobra: 'ROLLOVER' });

    const { ciclo } = await garantirCicloAtual(deps);

    expect(ciclo.rolloverRecebidoCents).toBe(-30_000);
    expect(ciclo.verbaVariavelCents).toBe(670_000); // 700000 − 30000
  });

  it('destinoSobra != ROLLOVER ignora a sobra do ciclo anterior', async () => {
    const deps = criarDeps({
      hoje: '2026-07-20',
      ciclos: [
        cicloFake({
          id: 'c-junho',
          dataInicio: '2026-06-05',
          dataFim: '2026-07-04',
          fechado: true,
          fechadoEm: '2026-07-05',
          sobraCents: 50_000,
        }),
      ],
    });

    const { ciclo } = await garantirCicloAtual(deps);

    expect(ciclo.rolloverRecebidoCents).toBe(0);
    expect(ciclo.verbaVariavelCents).toBe(700_000);
  });

  it('[BUG] não deve creditar a mesma sobra duas vezes quando um ciclo fica sem fechar', async () => {
    const deps = criarDeps({
      hoje: '2026-08-20',
      ciclos: [
        cicloFake({
          id: 'c-junho',
          dataInicio: '2026-06-05',
          dataFim: '2026-07-04',
          fechado: true,
          fechadoEm: '2026-07-05',
          sobraCents: 50_000,
        }),
        // Ciclo de julho já nasceu com o rollover e NÃO foi fechado.
        cicloFake({
          id: 'c-julho',
          dataInicio: '2026-07-05',
          dataFim: '2026-08-04',
          fechado: false,
          rolloverRecebidoCents: 50_000,
          verbaVariavelCents: 750_000,
        }),
      ],
    });
    deps.config.mutar({ destinoSobra: 'ROLLOVER' });

    const { ciclo } = await garantirCicloAtual(deps);

    // Esperado: nenhum rollover (a sobra de junho já foi para julho).
    // Observado: rolloverRecebidoCents === 50000 outra vez.
    expect(ciclo.rolloverRecebidoCents).toBe(0);
  });
});

describe('verba CONGELADA (regra inviolável 3)', () => {
  it('editar a Config depois do ciclo nascer NÃO altera a verba do ciclo atual', async () => {
    // Arrange
    const deps = criarDeps({ hoje: '2026-07-20' });
    const { ciclo: original } = await garantirCicloAtual(deps);
    expect(original.verbaVariavelCents).toBe(700_000);

    // Act: usuário mexe em tudo que compõe a verba.
    deps.config.mutar({ rendaBaseCents: 1_500_000, metaPoupancaCents: 500_000 });
    deps.custosFixos.itens.push({
      id: 'f-novo',
      nome: 'Academia',
      valorCents: 30_000,
      diaVencimento: 5,
      ativo: true,
      contaId: null,
      categoriaId: null,
      vigenteDe: null,
      vigenteAte: null,
    });
    const { ciclo: depois } = await garantirCicloAtual(deps);

    // Assert: nada mudou no ciclo vigente.
    expect(depois.verbaVariavelCents).toBe(700_000);
    expect(depois.rendaPrevistaCents).toBe(800_000);
    expect(depois.poupancaAlvoCents).toBe(100_000);
    expect(depois.fixosCents).toBe(0);
    expect(deps.ciclos.criarChamadas).toBe(1);
  });

  it('recalcularCicloAtual (ação explícita) recongela a partir da Config', async () => {
    const deps = criarDeps({ hoje: '2026-07-20' });
    await garantirCicloAtual(deps);

    deps.config.mutar({ metaPoupancaCents: 200_000 });
    const ciclo = await recalcularCicloAtual(deps);

    expect(ciclo.poupancaAlvoCents).toBe(200_000);
    expect(ciclo.verbaVariavelCents).toBe(600_000); // 800000 − 200000
  });

  it('recalcularCicloAtual preserva a renda prevista congelada do ciclo', async () => {
    const deps = criarDeps({ hoje: '2026-07-20' });
    await garantirCicloAtual(deps);

    deps.config.mutar({ rendaBaseCents: 1_000_000 });
    const ciclo = await recalcularCicloAtual(deps);

    // Renda do ciclo é congelada; recalcular não puxa a renda nova da Config.
    expect(ciclo.rendaPrevistaCents).toBe(800_000);
    expect(ciclo.verbaVariavelCents).toBe(700_000);
  });

  it('recalcularCicloAtualSeVazio ajusta o ciclo sem transações (onboarding)', async () => {
    const deps = criarDeps({ hoje: '2026-07-20', config: { ...deps0Config() } });
    await garantirCicloAtual(deps);
    expect(primeiro(deps.ciclos.itens).verbaVariavelCents).toBe(0);

    deps.config.mutar({ rendaBaseCents: 800_000, metaPoupancaCents: 100_000 });
    await recalcularCicloAtualSeVazio(deps);

    expect(primeiro(deps.ciclos.itens).rendaPrevistaCents).toBe(800_000);
    expect(primeiro(deps.ciclos.itens).verbaVariavelCents).toBe(700_000);
  });

  it('recalcularCicloAtualSeVazio NÃO mexe em ciclo que já tem histórico', async () => {
    const deps = criarDeps({ hoje: '2026-07-20' });
    const { ciclo } = await garantirCicloAtual(deps);
    await deps.transacoes.criar(transacaoFake({ cicloId: ciclo.id }));

    deps.config.mutar({ rendaBaseCents: 1_500_000 });
    await recalcularCicloAtualSeVazio(deps);

    expect(primeiro(deps.ciclos.itens).verbaVariavelCents).toBe(700_000);
    expect(primeiro(deps.ciclos.itens).rendaPrevistaCents).toBe(800_000);
  });

  it('recalcularCicloAtualSeVazio é no-op sem Config e sem ciclo', async () => {
    // Sem Config e sem ciclo não há período nem verba a informar: o efeito
    // devolvido tem `ciclo: null`, e é ele que impede a UI de inventar uma
    // frase com uma data que não existe.
    const semConfig = criarDeps({ config: null });
    await expect(recalcularCicloAtualSeVazio(semConfig)).resolves.toEqual({
      recalculou: false,
      ciclo: null,
    });

    const semCiclo = criarDeps({ hoje: '2026-07-20' });
    await expect(recalcularCicloAtualSeVazio(semCiclo)).resolves.toEqual({
      recalculou: false,
      ciclo: null,
    });
    expect(semCiclo.ciclos.itens).toHaveLength(0);
  });
});

/** Config de instalação limpa: renda 0 (onboarding). */
function deps0Config() {
  return {
    id: 1,
    rendaBaseCents: 0,
    rendaVariavel: false,
    diaRecebimento: 5,
    metaPoupancaCents: 0,
    metaPoupancaPercent: null,
    moeda: 'BRL',
    timezone: 'America/Bahia',
    destinoSobra: 'RESERVA' as const,
    destinoSobraContaId: null,
    pisoDiarioVerbaCents: 1_500,
  };
}

describe('limites do ciclo criado (SPEC 9 — dias 1/15/28/31, virada de ano, fevereiro, bissexto)', () => {
  const casos: ReadonlyArray<{
    nome: string;
    hoje: string;
    diaRecebimento: number;
    inicio: string;
    fim: string;
  }> = [
    { nome: 'dia 1 — ciclo == mês calendário', hoje: '2026-07-15', diaRecebimento: 1, inicio: '2026-07-01', fim: '2026-07-31' },
    { nome: 'dia 15 — antes do corte cai no ciclo anterior', hoje: '2026-07-10', diaRecebimento: 15, inicio: '2026-06-15', fim: '2026-07-14' },
    { nome: 'dia 28 — fevereiro comum', hoje: '2026-03-01', diaRecebimento: 28, inicio: '2026-02-28', fim: '2026-03-27' },
    { nome: 'dia 31 — clamp em fevereiro', hoje: '2026-02-10', diaRecebimento: 31, inicio: '2026-01-31', fim: '2026-02-27' },
    { nome: 'dia 31 — 29/02 em ano bissexto', hoje: '2024-02-29', diaRecebimento: 31, inicio: '2024-02-29', fim: '2024-03-30' },
    { nome: 'dia 28 — 29/02 em ano bissexto', hoje: '2024-02-29', diaRecebimento: 28, inicio: '2024-02-28', fim: '2024-03-27' },
    { nome: 'virada de ano dez -> jan', hoje: '2027-01-03', diaRecebimento: 5, inicio: '2026-12-05', fim: '2027-01-04' },
    { nome: 'último dia do ciclo ainda é o ciclo corrente', hoje: '2026-08-04', diaRecebimento: 5, inicio: '2026-07-05', fim: '2026-08-04' },
  ];

  it.each(casos)('$nome', async ({ hoje, diaRecebimento, inicio, fim }) => {
    const deps = criarDeps({ hoje });
    deps.config.mutar({ diaRecebimento });

    const { ciclo } = await garantirCicloAtual(deps);

    expect(ciclo.dataInicio).toBe(inicio);
    expect(ciclo.dataFim).toBe(fim);
    // Datas civis são STRING, nunca Date (regra inviolável 2).
    expect(typeof ciclo.dataInicio).toBe('string');
    expect(typeof ciclo.dataFim).toBe('string');
  });
});

describe('regressão de fuso — lançamento às 23h50 em America/Bahia (SPEC 9 e critério 10)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('23h50 de 31/07 em America/Bahia cai no ciclo de JULHO, não no de agosto', async () => {
    // 2026-07-31 23:50 em America/Bahia (UTC-3) === 2026-08-01T02:50:00Z.
    // Um `new Date(...).toISOString().slice(0,10)` ingênuo diria "2026-08-01"
    // e jogaria o gasto para o ciclo seguinte.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T02:50:00.000Z'));

    const relogio = new RelogioSistema('America/Bahia');
    expect(relogio.hoje()).toBe('2026-07-31');

    const deps = criarDeps({ relogio });
    deps.config.mutar({ diaRecebimento: 1 });

    const { ciclo } = await garantirCicloAtual(deps);

    expect(ciclo.dataInicio).toBe('2026-07-01');
    expect(ciclo.dataFim).toBe('2026-07-31');
  });

  it('00h10 de 01/08 em America/Bahia já cai no ciclo de agosto', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T03:10:00.000Z'));

    const relogio = new RelogioSistema('America/Bahia');
    expect(relogio.hoje()).toBe('2026-08-01');

    const deps = criarDeps({ relogio });
    deps.config.mutar({ diaRecebimento: 1 });

    const { ciclo } = await garantirCicloAtual(deps);

    expect(ciclo.dataInicio).toBe('2026-08-01');
    expect(ciclo.dataFim).toBe('2026-08-31');
  });
});

describe('puxarDaReserva (SPEC 5.4 — saída b do modo recuperação)', () => {
  it('rejeita valores não inteiros, zero ou negativos', async () => {
    const deps = criarDeps({ hoje: '2026-07-20' });

    await expect(puxarDaReserva(deps, 0)).rejects.toThrow('Valor a puxar inválido.');
    await expect(puxarDaReserva(deps, -100)).rejects.toThrow('Valor a puxar inválido.');
    await expect(puxarDaReserva(deps, 10.5)).rejects.toThrow('Valor a puxar inválido.');
    expect(deps.ciclos.criarChamadas).toBe(0);
  });

  it('move o saldo, cria TRANSFERENCIA e reduz a poupança-alvo só neste ciclo', async () => {
    const deps = criarDeps({
      hoje: '2026-07-20',
      contas: [
        contaFake({ id: 'reserva', tipo: 'RESERVA', saldoCents: 500_000 }),
        contaFake({ id: 'variavel', nome: 'Conta variável', tipo: 'VARIAVEL', saldoCents: 20_000 }),
      ],
    });

    const ciclo = await puxarDaReserva(deps, 50_000);

    expect(deps.contas.saldoDe('reserva')).toBe(450_000);
    expect(deps.contas.saldoDe('variavel')).toBe(70_000);
    expect(ciclo.poupancaAlvoCents).toBe(50_000); // 100000 − 50000
    expect(ciclo.verbaVariavelCents).toBe(750_000); // 700000 + 50000
    expect(ciclo.observacao).toContain('50000');

    const transferencias = deps.transacoes.itens.filter((t) => t.tipo === 'TRANSFERENCIA');
    expect(transferencias).toHaveLength(1);
    expect(primeiro(transferencias).valorCents).toBe(50_000);
    expect(primeiro(transferencias).data).toBe('2026-07-20');
    expect(primeiro(transferencias).categoriaId).toBeNull();
  });

  it('poupança-alvo nunca fica negativa mesmo puxando mais do que a meta', async () => {
    const deps = criarDeps({
      hoje: '2026-07-20',
      contas: [
        contaFake({ id: 'reserva', tipo: 'RESERVA', saldoCents: 900_000 }),
        contaFake({ id: 'variavel', nome: 'Conta variável', tipo: 'VARIAVEL', saldoCents: 0 }),
      ],
    });

    const ciclo = await puxarDaReserva(deps, 300_000);

    expect(ciclo.poupancaAlvoCents).toBe(0);
    expect(ciclo.verbaVariavelCents).toBe(1_000_000);
  });

  it('sem conta RESERVA/VARIAVEL ainda ajusta o ciclo, sem criar transação', async () => {
    const deps = criarDeps({ hoje: '2026-07-20' });

    const ciclo = await puxarDaReserva(deps, 10_000);

    expect(deps.transacoes.itens).toHaveLength(0);
    expect(ciclo.verbaVariavelCents).toBe(710_000);
  });
});
