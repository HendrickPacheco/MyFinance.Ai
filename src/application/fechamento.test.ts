/**
 * Testes do fechamento de ciclo (SPEC 7.2, regras 7/8/9, critério de aceite 7).
 *
 * Tudo roda contra fakes em memória — nenhum acesso ao banco real.
 */
import { describe, it, expect, vi } from 'vitest';
import { fecharCiclo, obterResumoFechamento, obterResumoParaFechar } from './fechamento';
import {
  criarDeps,
  primeiro,
  cicloFake,
  contaFake,
  provisaoFake,
  transacaoFake,
  CATEGORIA_FIXA,
  type FakeDeps,
  type OpcoesFakeDeps,
} from './__fakes__/fakes-ciclo-fechamento';
import type { Ciclo } from '@/domain/model/entidades';

const HOJE = '2026-08-05';

/** Ciclo de julho, aberto, verba 700.000 centavos, poupança-alvo 100.000. */
function cicloAberto(patch: Partial<Ciclo> = {}): Ciclo {
  return cicloFake({
    id: 'c-julho',
    dataInicio: '2026-07-05',
    dataFim: '2026-08-04',
    ...patch,
  });
}

function cenario(opcoes: OpcoesFakeDeps = {}): FakeDeps {
  const deps = criarDeps({
    hoje: HOJE,
    ciclos: [cicloAberto()],
    contas: [contaFake({ id: 'reserva', tipo: 'RESERVA', saldoCents: 0 })],
    ...opcoes,
  });
  deps.config.mutar({ destinoSobra: 'RESERVA', destinoSobraContaId: 'reserva' });
  return deps;
}

describe('sobra = verbaVariavel − gastoRealizado (SPEC regra 7)', () => {
  it('calcula a sobra em centavos inteiros e a grava no ciclo', async () => {
    // Arrange
    const deps = cenario({
      transacoes: [
        transacaoFake({ id: 't1', valorCents: 150_000, cicloId: 'c-julho' }),
        transacaoFake({ id: 't2', valorCents: 100_000, cicloId: 'c-julho' }),
      ],
    });

    // Act
    const r = await fecharCiclo(deps, 'c-julho', { rendaRealizadaCents: 800_000 });

    // Assert
    expect(r.sobraCents).toBe(450_000);
    expect(Number.isInteger(r.sobraCents)).toBe(true);
    expect(primeiro(deps.ciclos.itens).sobraCents).toBe(450_000);
    expect(primeiro(deps.ciclos.itens).fechado).toBe(true);
    expect(primeiro(deps.ciclos.itens).fechadoEm).toBe(HOJE);
  });

  it('sobra NEGATIVA (estourou a verba) é gravada como déficit, não zerada', async () => {
    const deps = cenario({
      transacoes: [transacaoFake({ id: 't1', valorCents: 780_000, cicloId: 'c-julho' })],
    });

    const r = await fecharCiclo(deps, 'c-julho', { rendaRealizadaCents: 800_000 });

    expect(r.sobraCents).toBe(-80_000);
    expect(primeiro(deps.ciclos.itens).sobraCents).toBe(-80_000);
  });

  it('TRANSFERENCIA, RENDA, categoria FIXO e gasto de provisão NÃO entram na sobra', async () => {
    const deps = cenario({
      transacoes: [
        transacaoFake({ id: 't-var', valorCents: 100_000, cicloId: 'c-julho' }),
        transacaoFake({ id: 't-transf', valorCents: 300_000, tipo: 'TRANSFERENCIA', cicloId: 'c-julho' }),
        transacaoFake({ id: 't-renda', valorCents: 400_000, tipo: 'RENDA', cicloId: 'c-julho' }),
        transacaoFake({ id: 't-fixo', valorCents: 200_000, categoriaId: CATEGORIA_FIXA.id, cicloId: 'c-julho' }),
        transacaoFake({ id: 't-prov', valorCents: 120_000, provisaoId: 'prov-x', cicloId: 'c-julho' }),
        transacaoFake({ id: 't-sem-cat', valorCents: 50_000, categoriaId: null, cicloId: 'c-julho' }),
      ],
    });

    const r = await fecharCiclo(deps, 'c-julho', { rendaRealizadaCents: 800_000 });

    // Só os 100.000 do gasto VARIAVEL consomem verba.
    expect(r.sobraCents).toBe(600_000);
  });

  it('ESTORNO abate o gasto do ciclo', async () => {
    const deps = cenario({
      transacoes: [
        transacaoFake({ id: 't1', valorCents: 200_000, cicloId: 'c-julho' }),
        transacaoFake({ id: 't2', valorCents: 50_000, tipo: 'ESTORNO', cicloId: 'c-julho' }),
      ],
    });

    const r = await fecharCiclo(deps, 'c-julho', { rendaRealizadaCents: 800_000 });

    expect(r.sobraCents).toBe(550_000); // 700000 − (200000 − 50000)
  });

  it('transação com data posterior ao fim do ciclo não entra no gasto', async () => {
    const deps = cenario({
      transacoes: [
        transacaoFake({ id: 't-dentro', data: '2026-08-04', valorCents: 100_000, cicloId: 'c-julho' }),
        transacaoFake({ id: 't-fora', data: '2026-08-05', valorCents: 100_000, cicloId: 'c-julho' }),
      ],
    });

    const r = await fecharCiclo(deps, 'c-julho', { rendaRealizadaCents: 800_000 });

    expect(r.sobraCents).toBe(600_000);
  });
});

describe('destinação da sobra (Config.destinoSobra + destinoSobraContaId)', () => {
  it('RESERVA move a sobra POSITIVA para a conta de destino', async () => {
    const deps = cenario({
      transacoes: [transacaoFake({ id: 't1', valorCents: 200_000, cicloId: 'c-julho' })],
    });

    await fecharCiclo(deps, 'c-julho', { rendaRealizadaCents: 800_000 });

    expect(deps.contas.ajustes).toEqual([{ id: 'reserva', deltaCents: 500_000 }]);
    expect(deps.contas.saldoDe('reserva')).toBe(500_000);
  });

  it('sobra NEGATIVA debita a conta de destino', async () => {
    const deps = cenario({
      contas: [contaFake({ id: 'reserva', tipo: 'RESERVA', saldoCents: 1_000_000 })],
      transacoes: [transacaoFake({ id: 't1', valorCents: 750_000, cicloId: 'c-julho' })],
    });
    deps.config.mutar({ destinoSobra: 'RESERVA', destinoSobraContaId: 'reserva' });

    const r = await fecharCiclo(deps, 'c-julho', { rendaRealizadaCents: 800_000 });

    expect(r.sobraCents).toBe(-50_000);
    expect(deps.contas.saldoDe('reserva')).toBe(950_000);
    // Déficit não conta como poupança extra.
    expect(r.taxaPoupancaEfetiva).toBeCloseTo(100_000 / 800_000, 10);
  });

  it('sobra ZERO não gera ajuste de saldo', async () => {
    const deps = cenario({
      transacoes: [transacaoFake({ id: 't1', valorCents: 700_000, cicloId: 'c-julho' })],
    });

    const r = await fecharCiclo(deps, 'c-julho', { rendaRealizadaCents: 800_000 });

    expect(r.sobraCents).toBe(0);
    expect(deps.contas.ajustes).toEqual([]);
  });

  it('ROLLOVER não mexe em conta nenhuma — a sobra fica no ciclo para o próximo', async () => {
    const deps = cenario({
      transacoes: [transacaoFake({ id: 't1', valorCents: 200_000, cicloId: 'c-julho' })],
    });
    deps.config.mutar({ destinoSobra: 'ROLLOVER' });

    const r = await fecharCiclo(deps, 'c-julho', { rendaRealizadaCents: 800_000 });

    expect(deps.contas.ajustes).toEqual([]);
    expect(primeiro(deps.ciclos.itens).sobraCents).toBe(500_000);
    expect(r.taxaPoupancaEfetiva).toBeCloseTo(100_000 / 800_000, 10);
  });

  it('INVESTIMENTO também usa destinoSobraContaId', async () => {
    const deps = cenario({
      contas: [contaFake({ id: 'cdb', nome: 'CDB', tipo: 'INVESTIMENTO', saldoCents: 10_000 })],
      transacoes: [transacaoFake({ id: 't1', valorCents: 300_000, cicloId: 'c-julho' })],
    });
    deps.config.mutar({ destinoSobra: 'INVESTIMENTO', destinoSobraContaId: 'cdb' });

    await fecharCiclo(deps, 'c-julho', { rendaRealizadaCents: 800_000 });

    expect(deps.contas.saldoDe('cdb')).toBe(410_000);
  });

  it('[BUG] sobra com destino RESERVA e sem conta configurada não pode sumir', async () => {
    const deps = cenario({
      transacoes: [transacaoFake({ id: 't1', valorCents: 200_000, cicloId: 'c-julho' })],
    });
    deps.config.mutar({ destinoSobra: 'RESERVA', destinoSobraContaId: null });

    await fecharCiclo(deps, 'c-julho', { rendaRealizadaCents: 800_000 });

    // Esperado: algum destino (erro explícito ou conta RESERVA padrão).
    // Observado: `deps.contas.ajustes` fica vazio e a sobra evapora.
    expect(deps.contas.ajustes).not.toEqual([]);
  });
});

describe('crédito de provisão no fechamento (decisão 4)', () => {
  it('credita provisaoMensal no acumulado de cada provisão ATIVA', async () => {
    const deps = cenario({
      provisoes: [
        provisaoFake({ id: 'p-ipva', valorAnualCents: 120_000 }),
        provisaoFake({ id: 'p-seguro', valorAnualCents: 60_000 }),
        provisaoFake({ id: 'p-inativa', valorAnualCents: 999_999, ativo: false }),
      ],
    });

    await fecharCiclo(deps, 'c-julho', { rendaRealizadaCents: 800_000 });

    expect(deps.provisoes.acumuladoDe('p-ipva')).toBe(10_000);
    expect(deps.provisoes.acumuladoDe('p-seguro')).toBe(5_000);
    expect(deps.provisoes.acumuladoDe('p-inativa')).toBe(0);
    expect(deps.provisoes.ajustes).toHaveLength(2);
  });

  it('acumula sobre o valor já existente, sempre em centavos inteiros', async () => {
    const deps = cenario({
      provisoes: [provisaoFake({ id: 'p1', valorAnualCents: 100_000, acumuladoCents: 25_000 })],
    });

    await fecharCiclo(deps, 'c-julho', { rendaRealizadaCents: 800_000 });

    // floor(100000/12) = 8333
    expect(deps.provisoes.acumuladoDe('p1')).toBe(33_333);
    expect(Number.isInteger(deps.provisoes.acumuladoDe('p1'))).toBe(true);
  });

  it('[BUG] o total creditado deve ser igual à provisão reservada na verba', async () => {
    const deps = cenario({
      ciclos: [cicloAberto({ provisaoMensalCents: 183 })],
      provisoes: [
        provisaoFake({ id: 'p1', valorAnualCents: 1_100 }),
        provisaoFake({ id: 'p2', valorAnualCents: 1_100 }),
      ],
    });
    deps.config.mutar({ destinoSobra: 'RESERVA', destinoSobraContaId: 'reserva' });

    await fecharCiclo(deps, 'c-julho', { rendaRealizadaCents: 800_000 });

    const creditado = deps.provisoes.ajustes.reduce((s, a) => s + a.deltaCents, 0);
    expect(creditado).toBe(183); // observado: 182
  });
});

describe('idempotência do fechamento (regra: fechar duas vezes não credita em dobro)', () => {
  it('a segunda chamada falha e NÃO credita provisão nem mexe em saldo de novo', async () => {
    // Arrange
    const deps = cenario({
      provisoes: [provisaoFake({ id: 'p1', valorAnualCents: 120_000 })],
      transacoes: [transacaoFake({ id: 't1', valorCents: 200_000, cicloId: 'c-julho' })],
    });

    // Act
    await fecharCiclo(deps, 'c-julho', { rendaRealizadaCents: 800_000 });
    const segunda = fecharCiclo(deps, 'c-julho', { rendaRealizadaCents: 800_000 });

    // Assert
    await expect(segunda).rejects.toThrow('Este ciclo já foi fechado.');
    expect(deps.provisoes.acumuladoDe('p1')).toBe(10_000);
    expect(deps.provisoes.ajustes).toHaveLength(1);
    expect(deps.contas.ajustes).toHaveLength(1);
    expect(deps.contas.saldoDe('reserva')).toBe(500_000);
  });

  it('quando a reivindicação atômica perde a corrida, aborta ANTES de creditar', async () => {
    const deps = cenario({
      provisoes: [provisaoFake({ id: 'p1', valorAnualCents: 120_000 })],
    });
    // Simula outro clique/retry tendo fechado entre o `obter` e o `fecharSePendente`.
    vi.spyOn(deps.ciclos, 'fecharSePendente').mockResolvedValue(false);

    await expect(
      fecharCiclo(deps, 'c-julho', { rendaRealizadaCents: 800_000 }),
    ).rejects.toThrow('Este ciclo já foi fechado.');

    expect(deps.provisoes.ajustes).toEqual([]);
    expect(deps.contas.ajustes).toEqual([]);
  });

  it('rejeita ciclo inexistente e ciclo já marcado como fechado', async () => {
    const deps = cenario({
      ciclos: [cicloAberto({ id: 'c-fechado', fechado: true, fechadoEm: '2026-08-05', sobraCents: 0 })],
    });

    await expect(fecharCiclo(deps, 'nao-existe', { rendaRealizadaCents: 1 })).rejects.toThrow(
      'Ciclo não encontrado.',
    );
    await expect(fecharCiclo(deps, 'c-fechado', { rendaRealizadaCents: 1 })).rejects.toThrow(
      'Este ciclo já foi fechado.',
    );
    expect(deps.ciclos.fecharSePendenteChamadas).toBe(0);
  });

  it('rejeita quando não há Config', async () => {
    const deps = criarDeps({ hoje: HOJE, ciclos: [cicloAberto()], config: null });

    await expect(fecharCiclo(deps, 'c-julho', { rendaRealizadaCents: 1 })).rejects.toThrow(
      'Configuração não encontrada.',
    );
  });
});

describe('renda realizada é INPUT do usuário, não somatório de transações', () => {
  it('grava exatamente o valor informado, ignorando as transações de RENDA', async () => {
    const deps = cenario({
      transacoes: [
        transacaoFake({ id: 't-renda-a', valorCents: 900_000, tipo: 'RENDA', cicloId: 'c-julho' }),
        transacaoFake({ id: 't-renda-b', valorCents: 100_000, tipo: 'RENDA', cicloId: 'c-julho' }),
      ],
    });

    const r = await fecharCiclo(deps, 'c-julho', { rendaRealizadaCents: 512_345 });

    expect(primeiro(deps.ciclos.itens).rendaRealizadaCents).toBe(512_345);
    expect(r.taxaPoupancaEfetiva).toBeCloseTo((100_000 + 700_000) / 512_345, 10);
  });

  it('renda realizada zero não divide por zero — taxa é 0', async () => {
    const deps = cenario();

    const r = await fecharCiclo(deps, 'c-julho', { rendaRealizadaCents: 0 });

    expect(r.taxaPoupancaEfetiva).toBe(0);
    expect(Number.isFinite(r.taxaPoupancaEfetiva)).toBe(true);
  });

  it('grava a observação do fechamento (ou null)', async () => {
    const deps = cenario();

    await fecharCiclo(deps, 'c-julho', {
      rendaRealizadaCents: 800_000,
      observacao: 'mês de férias',
    });

    expect(primeiro(deps.ciclos.itens).observacao).toBe('mês de férias');
  });
});

describe('recalibração de meta (passo 5 do wizard / SPEC regra 12)', () => {
  const anteriorFechado = (sobraCents: number): Ciclo =>
    cicloFake({
      id: 'c-junho',
      dataInicio: '2026-06-05',
      dataFim: '2026-07-04',
      fechado: true,
      fechadoEm: '2026-07-05',
      sobraCents,
    });

  it('sugere aumento só quando SOBROU com folga em 2 ciclos seguidos', async () => {
    const deps = cenario({
      ciclos: [cicloAberto(), anteriorFechado(80_000)],
      transacoes: [transacaoFake({ id: 't1', valorCents: 650_000, cicloId: 'c-julho' })],
    });

    const resumo = await obterResumoFechamento(deps, primeiro(deps.ciclos.itens));

    // sobra atual = 50.000; anterior = 80.000 -> sobe pela MENOR das duas.
    expect(resumo.sobraCents).toBe(50_000);
    expect(resumo.metaSugeridaCents).toBe(150_000); // 100.000 + 50.000
  });

  it('usa a menor sobra quando a anterior foi menor', async () => {
    const deps = cenario({
      ciclos: [cicloAberto(), anteriorFechado(20_000)],
      transacoes: [transacaoFake({ id: 't1', valorCents: 650_000, cicloId: 'c-julho' })],
    });

    const resumo = await obterResumoFechamento(deps, primeiro(deps.ciclos.itens));

    expect(resumo.metaSugeridaCents).toBe(120_000);
  });

  it('NÃO sugere aumento quando o ciclo anterior teve déficit', async () => {
    const deps = cenario({
      ciclos: [cicloAberto(), anteriorFechado(-10_000)],
      transacoes: [transacaoFake({ id: 't1', valorCents: 650_000, cicloId: 'c-julho' })],
    });

    const resumo = await obterResumoFechamento(deps, primeiro(deps.ciclos.itens));

    expect(resumo.metaSugeridaCents).toBeNull();
  });

  it('NÃO sugere aumento quando o ciclo atual estourou', async () => {
    const deps = cenario({
      ciclos: [cicloAberto(), anteriorFechado(80_000)],
      transacoes: [transacaoFake({ id: 't1', valorCents: 800_000, cicloId: 'c-julho' })],
    });

    const resumo = await obterResumoFechamento(deps, primeiro(deps.ciclos.itens));

    expect(resumo.sobraCents).toBe(-100_000);
    expect(resumo.metaSugeridaCents).toBeNull();
  });

  it('NÃO sugere aumento no primeiro fechamento (sem ciclo anterior)', async () => {
    const deps = cenario({
      transacoes: [transacaoFake({ id: 't1', valorCents: 100_000, cicloId: 'c-julho' })],
    });

    const resumo = await obterResumoFechamento(deps, primeiro(deps.ciclos.itens));

    expect(resumo.metaSugeridaCents).toBeNull();
  });

  it('sobra exatamente zero não conta como folga', async () => {
    const deps = cenario({
      ciclos: [cicloAberto(), anteriorFechado(80_000)],
      transacoes: [transacaoFake({ id: 't1', valorCents: 700_000, cicloId: 'c-julho' })],
    });

    const resumo = await obterResumoFechamento(deps, primeiro(deps.ciclos.itens));

    expect(resumo.sobraCents).toBe(0);
    expect(resumo.metaSugeridaCents).toBeNull();
  });

  it('aplica a nova meta só quando o usuário confirma, e zera o percentual', async () => {
    const deps = cenario();
    deps.config.mutar({ metaPoupancaPercent: 12.5 });

    await fecharCiclo(deps, 'c-julho', {
      rendaRealizadaCents: 800_000,
      novaMetaPoupancaCents: 150_000,
    });

    const config = await deps.config.obter();
    expect(config?.metaPoupancaCents).toBe(150_000);
    expect(config?.metaPoupancaPercent).toBeNull();
    expect(deps.config.salvarChamadas).toBe(1);
  });

  it('não toca na Config quando novaMetaPoupancaCents não é informada', async () => {
    const deps = cenario();

    await fecharCiclo(deps, 'c-julho', { rendaRealizadaCents: 800_000 });

    expect(deps.config.salvarChamadas).toBe(0);
  });
});

describe('resumo do fechamento — transações sem categoria e sugestões de patrimônio', () => {
  it('lista só DESPESA sem categoria (renda/transferência sem categoria não entram)', async () => {
    const deps = cenario({
      transacoes: [
        transacaoFake({ id: 't-sem', valorCents: 5_000, categoriaId: null, cicloId: 'c-julho' }),
        transacaoFake({ id: 't-com', valorCents: 5_000, cicloId: 'c-julho' }),
        transacaoFake({ id: 't-renda', valorCents: 5_000, tipo: 'RENDA', categoriaId: null, cicloId: 'c-julho' }),
        transacaoFake({ id: 't-outro-ciclo', valorCents: 5_000, categoriaId: null, cicloId: 'c-junho' }),
      ],
    });

    const resumo = await obterResumoFechamento(deps, primeiro(deps.ciclos.itens));

    expect(resumo.transacoesSemCategoria.map((t) => t.id)).toEqual(['t-sem']);
  });

  it('sem snapshot anterior, sugere os saldos das contas que entram no patrimônio', async () => {
    const deps = cenario({
      contas: [
        contaFake({ id: 'reserva', tipo: 'RESERVA', saldoCents: 300_000 }),
        contaFake({ id: 'oculta', nome: 'Cartão', tipo: 'VARIAVEL', saldoCents: 1_000, incluiPatrimonio: false }),
      ],
    });

    const resumo = await obterResumoFechamento(deps, primeiro(deps.ciclos.itens));

    expect(resumo.itensPatrimonioSugeridos).toEqual([
      { nome: 'Reserva', classe: 'CONTA', valorCents: 300_000 },
    ]);
  });

  it('obterResumoParaFechar prioriza o ciclo pendente sobre o ciclo atual', async () => {
    const deps = criarDeps({
      hoje: '2026-07-20',
      ciclos: [
        cicloFake({ id: 'c-junho', dataInicio: '2026-06-05', dataFim: '2026-07-04', fechado: false }),
        cicloFake({ id: 'c-julho', dataInicio: '2026-07-05', dataFim: '2026-08-04', fechado: false }),
      ],
    });

    const resumo = await obterResumoParaFechar(deps);

    expect(resumo?.ciclo.id).toBe('c-junho');
  });

  it('obterResumoParaFechar devolve o ciclo atual quando não há pendência', async () => {
    const deps = criarDeps({
      hoje: '2026-07-20',
      ciclos: [cicloFake({ id: 'c-julho', dataInicio: '2026-07-05', dataFim: '2026-08-04' })],
    });

    const resumo = await obterResumoParaFechar(deps);

    expect(resumo?.ciclo.id).toBe('c-julho');
  });
});

describe('snapshot de patrimônio no fechamento (critério de aceite 7)', () => {
  it('cria o snapshot e devolve a variação contra o anterior', async () => {
    const deps = cenario({
      snapshots: [
        {
          id: 'snap-antigo',
          data: '2026-07-05',
          totalCents: 1_000_000,
          itens: [
            { id: 'i1', snapshotId: 'snap-antigo', nome: 'Reserva', classe: 'CONTA', valorCents: 1_000_000 },
          ],
        },
      ],
    });

    const r = await fecharCiclo(deps, 'c-julho', {
      rendaRealizadaCents: 800_000,
      snapshotData: '2026-08-05',
      snapshotItens: [
        { nome: 'Reserva', classe: 'CONTA', valorCents: 700_000 },
        { nome: 'CDB', classe: 'RENDA_FIXA', valorCents: 500_000 },
      ],
    });

    expect(r.variacaoPatrimonioCents).toBe(200_000); // 1.200.000 − 1.000.000
    expect(deps.patrimonio.itens).toHaveLength(2);
    const novo = deps.patrimonio.itens.find((s) => s.data === '2026-08-05');
    expect(novo?.totalCents).toBe(1_200_000);
    expect(novo?.itens).toHaveLength(2);
  });

  it('sem snapshot anterior a variação é null (não 0)', async () => {
    const deps = cenario();

    const r = await fecharCiclo(deps, 'c-julho', {
      rendaRealizadaCents: 800_000,
      snapshotData: '2026-08-05',
      snapshotItens: [{ nome: 'Reserva', classe: 'CONTA', valorCents: 500_000 }],
    });

    expect(r.variacaoPatrimonioCents).toBeNull();
    expect(deps.patrimonio.itens).toHaveLength(1);
  });

  it('lista de itens vazia não cria snapshot', async () => {
    const deps = cenario();

    const r = await fecharCiclo(deps, 'c-julho', {
      rendaRealizadaCents: 800_000,
      snapshotData: '2026-08-05',
      snapshotItens: [],
    });

    expect(r.variacaoPatrimonioCents).toBeNull();
    expect(deps.patrimonio.itens).toHaveLength(0);
  });
});
