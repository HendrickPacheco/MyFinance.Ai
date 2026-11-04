import { describe, it, expect } from 'vitest';
import { atualizarConfig, upsertCategoria } from './config';
import { criarDeps, CONFIG_PADRAO, CATEGORIA_VARIAVEL } from './__fakes__/fakes-ciclo-fechamento';

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
