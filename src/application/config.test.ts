import { describe, it, expect } from 'vitest';
import { atualizarConfig, upsertCategoria, obterEstadoConfig } from './config';
import { criarDeps, cicloFake, CONFIG_PADRAO, CATEGORIA_VARIAVEL } from './__fakes__/fakes-ciclo-fechamento';

describe('atualizarConfig preserva a renda em moeda de origem', () => {
  it('salvar sem os campos USD no input mantém os já gravados', async () => {
    const deps = criarDeps({
      hoje: '2026-07-20',
      config: {
        ...CONFIG_PADRAO,
        moedaRenda: 'USD',
        rendaBrutaMoedaOrigemCents: 730_000,
        impostoEstimadoCents: 350_000,
        fonteRenda: 'contrato',
      },
    });
    const { id: _id, moedaRenda: _m, rendaBrutaMoedaOrigemCents: _r, impostoEstimadoCents: _i,
      impostoEstimadoPercentual: _p, fonteRenda: _f, ...semCampos } = CONFIG_PADRAO;

    const salva = await atualizarConfig(deps, { ...semCampos, metaPoupancaCents: 150_000 });

    expect(salva).toMatchObject({
      metaPoupancaCents: 150_000,
      moedaRenda: 'USD',
      rendaBrutaMoedaOrigemCents: 730_000,
      impostoEstimadoCents: 350_000,
      fonteRenda: 'contrato',
    });
  });
});

describe('atualizarConfig com renda em USD', () => {
  it('grava rendaBaseCents como a líquida em reais derivada da cotação', async () => {
    const deps = criarDeps({ hoje: '2026-11-04' });
    await deps.cotacoes.salvar({
      data: '2026-11-03', moedaOrigem: 'USD', moedaDestino: 'BRL', taxaMicros: 5_430_000, fonte: 'PTAX_BCB',
    });
    const { id: _id, ...input } = CONFIG_PADRAO;

    const salva = await atualizarConfig(deps, {
      ...input,
      moedaRenda: 'USD',
      rendaBrutaMoedaOrigemCents: 730_000,
      impostoEstimadoCents: 350_000,
    });

    expect(salva.rendaBaseCents).toBe(3_613_900);
  });
});

describe('upsertCategoria preserva tipoVerba', () => {
  it('editar sem tipoVerba mantém o valor anterior; criar nasce EXTRA', async () => {
    const deps = criarDeps({ categorias: [{ ...CATEGORIA_VARIAVEL, tipoVerba: 'DIA_A_DIA' }] });
    const { tipoVerba: _t, ...semTipo } = CATEGORIA_VARIAVEL;

    const editada = await upsertCategoria(deps, { ...semTipo, nome: 'Mercadão' });
    expect(editada.tipoVerba).toBe('DIA_A_DIA');

    const nova = await upsertCategoria(deps, { ...semTipo, id: '', nome: 'Nova' });
    expect(nova.tipoVerba).toBe('EXTRA');
  });
});

describe('obterEstadoConfig: sugestão de meta pela poupança real', () => {
  const fechado = (i: number, real: number | null) =>
    cicloFake({ id: `c${i}`, dataInicio: `2026-0${i}-05`, dataFim: `2026-0${i + 1}-04`, fechado: true, poupancaRealCents: real });

  it('3 fechados medidos → média arredondada para baixo', async () => {
    const deps = criarDeps({ ciclos: [fechado(1, 425_000), fechado(2, 600_000), fechado(3, 380_000)] });
    const e = await obterEstadoConfig(deps);
    expect(e.sugestaoMetaPorPoupancaReal).toEqual({ mediaCents: 468_333, ciclos: 3 });
  });

  it('2 ciclos, ou algum dos 3 sem medição → null', async () => {
    const dois = await obterEstadoConfig(criarDeps({ ciclos: [fechado(1, 425_000), fechado(2, 600_000)] }));
    expect(dois.sugestaoMetaPorPoupancaReal).toBeNull();
    const furo = await obterEstadoConfig(
      criarDeps({ ciclos: [fechado(1, 425_000), fechado(2, null), fechado(3, 380_000)] }),
    );
    expect(furo.sugestaoMetaPorPoupancaReal).toBeNull();
  });

  it('config em BRL: sem renda prevista em USD nem aviso', async () => {
    const e = await obterEstadoConfig(criarDeps());
    expect(e.rendaPrevistaUsd).toBeNull();
    expect(e.avisoCotacao).toBeNull();
  });

  it('config em USD: decomposição vem do read-model; sem cotação, traz aviso', async () => {
    const deps = criarDeps({
      hoje: '2026-11-04',
      config: { ...CONFIG_PADRAO, moedaRenda: 'USD', rendaBrutaMoedaOrigemCents: 730_000, impostoEstimadoCents: 350_000 },
    });
    await deps.cotacoes.salvar({
      data: '2026-11-03', moedaOrigem: 'USD', moedaDestino: 'BRL', taxaMicros: 5_430_000, fonte: 'PTAX_BCB',
    });
    const e = await obterEstadoConfig(deps);
    expect(e.rendaPrevistaUsd?.liquidaCents).toBe(3_613_900);
    expect(e.avisoCotacao).toBeNull();

    const sem = await obterEstadoConfig(
      criarDeps({ config: { ...CONFIG_PADRAO, moedaRenda: 'USD', rendaBrutaMoedaOrigemCents: 730_000 } }),
    );
    expect(sem.rendaPrevistaUsd?.motivoSemCotacao).not.toBeNull();
    expect(sem.avisoCotacao).toMatch(/cotação/i);
  });
});

describe('atualizarConfig: imposto fixo OU percentual', () => {
  it('os dois preenchidos → erro, nada gravado', async () => {
    const deps = criarDeps();
    const { id: _id, ...input } = CONFIG_PADRAO;
    await expect(
      atualizarConfig(deps, { ...input, moedaRenda: 'USD', rendaBrutaMoedaOrigemCents: 730_000, impostoEstimadoCents: 1, impostoEstimadoPercentual: 10 }),
    ).rejects.toThrow(/fixo OU percentual/);
    expect((await deps.config.obter())?.moedaRenda).toBe('BRL');
  });
});
