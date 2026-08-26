/**
 * Testes da extração de fatura (I3). Cobrem exatamente as garantias do
 * cabeçalho de `extrair.ts`: fatiamento em blocos de ~20 linhas com `ordem`
 * contínua, ano resolvido por função pura (inclusive a virada de dezembro),
 * data irresolúvel virando `null` sem derrubar as outras linhas, valor
 * inválido rejeitado pelo schema, parcela lida do texto, e texto vazio sem
 * gastar nenhuma chamada.
 *
 * Nenhuma chamada real de API: tudo roda sobre `FakeProvedorIA`.
 */
import { describe, expect, it } from 'vitest';
import { ATOR_VIEWER, criarDeps } from '../__fakes__/fakes-ciclo-fechamento';
import { AcessoNegadoError } from '@/domain/auth/permissoes';
import { ErroProvedorIA } from '@/domain/ports/ia';
import { FakeProvedorIA } from '../__fakes__/fake-provedor-ia';
import {
  ExtracaoIAIndisponivelError,
  extrairItensDaFatura,
} from './extrair';

/** Item mínimo válido contra `ITEM_TRANSCRITO_SCHEMA`, com overrides pontuais. */
function itemTranscrito(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    descricaoOriginal: 'PADARIA DO ZE',
    valorCents: 1590,
    sinal: 'COMPRA',
    dataOriginalTexto: '12/03',
    parcelaAtual: null,
    parcelaTotal: null,
    confianca: 'ALTA',
    ...overrides,
  };
}

function deps(ia: FakeProvedorIA = new FakeProvedorIA()) {
  const d = criarDeps();
  d.ia = ia;
  return d;
}

describe('extrairItensDaFatura', () => {
  it('recusa VIEWER — IA gasta dinheiro real (DA-3)', async () => {
    const d = deps();
    d.ator = ATOR_VIEWER;

    await expect(
      extrairItensDaFatura(d, { texto: 'algo', competenciaRef: '2026-07' }),
    ).rejects.toBeInstanceOf(AcessoNegadoError);
  });

  it('devolve lista vazia sem chamar o provedor quando o texto é vazio', async () => {
    const ia = new FakeProvedorIA();
    const d = deps(ia);

    const resultado = await extrairItensDaFatura(d, { texto: '   \n  \n', competenciaRef: '2026-07' });

    expect(resultado).toEqual({ itens: [], consumo: { entrada: 0, saida: 0 } });
    expect(ia.chamadasDeSchema).toHaveLength(0);
  });

  it('lança ExtracaoIAIndisponivelError quando a camada de IA está desligada', async () => {
    const d = criarDeps();
    d.ia = undefined;

    await expect(
      extrairItensDaFatura(d, { texto: 'PADARIA 12/03 15,90', competenciaRef: '2026-07' }),
    ).rejects.toBeInstanceOf(ExtracaoIAIndisponivelError);
  });

  it('fatia 45 linhas em 3 lotes e mantém `ordem` contínua entre eles', async () => {
    const ia = new FakeProvedorIA();
    ia.programarSchema(
      { tipo: 'DADOS', dados: { itens: Array.from({ length: 20 }, () => itemTranscrito()) } },
      { tipo: 'DADOS', dados: { itens: Array.from({ length: 20 }, () => itemTranscrito()) } },
      { tipo: 'DADOS', dados: { itens: Array.from({ length: 5 }, () => itemTranscrito()) } },
    );
    const d = deps(ia);
    const texto = Array.from({ length: 45 }, (_, i) => `ESTABELECIMENTO ${i} 12/03 R$ 15,90`).join('\n');

    const resultado = await extrairItensDaFatura(d, { texto, competenciaRef: '2026-07' });

    expect(ia.chamadasDeSchema).toHaveLength(3);
    expect(resultado.itens).toHaveLength(45);
    expect(resultado.itens.map((item) => item.ordem)).toEqual(Array.from({ length: 45 }, (_, i) => i));
  });

  it('resolve o ano pela função pura, inclusive na virada de dezembro', async () => {
    const ia = new FakeProvedorIA();
    ia.programarSchema({
      tipo: 'DADOS',
      dados: { itens: [itemTranscrito({ dataOriginalTexto: '12/12' })] },
    });
    const d = deps(ia);

    // Competência 2027-01: a linha "12/12" impressa é de dezembro de 2026,
    // não de 2027 — o ano da competência cairia no futuro e é descartado.
    const resultado = await extrairItensDaFatura(d, { texto: 'linha única', competenciaRef: '2027-01' });

    expect(resultado.itens[0]?.data).toBe('2026-12-12');
    expect(resultado.itens[0]?.dataOriginalTexto).toBe('12/12');
  });

  it('data irresolúvel vira `data: null` e não derruba as outras linhas do lote', async () => {
    const ia = new FakeProvedorIA();
    ia.programarSchema({
      tipo: 'DADOS',
      dados: {
        itens: [
          itemTranscrito({ dataOriginalTexto: 'texto sem formato de data' }),
          itemTranscrito({ dataOriginalTexto: '20/05' }),
        ],
      },
    });
    const d = deps(ia);

    const resultado = await extrairItensDaFatura(d, { texto: 'duas linhas', competenciaRef: '2026-07' });

    expect(resultado.itens).toHaveLength(2);
    expect(resultado.itens[0]?.data).toBeNull();
    expect(resultado.itens[0]?.dataOriginalTexto).toBe('texto sem formato de data');
    expect(resultado.itens[1]?.data).toBe('2026-05-20');
  });

  it('preenche `parcela` quando a linha imprime parcelamento ("3/12")', async () => {
    const ia = new FakeProvedorIA();
    ia.programarSchema({
      tipo: 'DADOS',
      dados: {
        itens: [
          itemTranscrito({ descricaoOriginal: 'LOJA X PARC 03/12', parcelaAtual: 3, parcelaTotal: 12 }),
        ],
      },
    });
    const d = deps(ia);

    const resultado = await extrairItensDaFatura(d, { texto: 'uma linha', competenciaRef: '2026-07' });

    expect(resultado.itens[0]?.parcela).toEqual({ atual: 3, total: 12 });
  });

  it('valor negativo ou não-inteiro devolvido pelo modelo é rejeitado pelo schema', async () => {
    const ia = new FakeProvedorIA();
    ia.programarSchema({
      tipo: 'DADOS',
      dados: { itens: [itemTranscrito({ valorCents: -1590 })] },
    });
    const d = deps(ia);

    await expect(
      extrairItensDaFatura(d, { texto: 'uma linha', competenciaRef: '2026-07' }),
    ).rejects.toBeInstanceOf(ErroProvedorIA);
  });

  it('respeita o teto diário de IA — não chama o provedor quando já estourou', async () => {
    const ia = new FakeProvedorIA();
    ia.programarSchema({ tipo: 'DADOS', dados: { itens: [itemTranscrito()] } });
    const d = criarDeps({ usoIA: { requisicoes: 50, tokensEntrada: 0, tokensSaida: 0 } });
    d.ia = ia;

    await expect(
      extrairItensDaFatura(d, { texto: 'uma linha', competenciaRef: '2026-07' }),
    ).rejects.toThrow(/Limite diário/);
    expect(ia.chamadasDeSchema).toHaveLength(0);
  });

  it('registra o consumo de tokens no contador diário a cada lote', async () => {
    const ia = new FakeProvedorIA();
    ia.programarSchema({
      tipo: 'DADOS',
      dados: { itens: [itemTranscrito()] },
      consumo: { entrada: 500, saida: 80 },
    });
    const d = deps(ia);

    const resultado = await extrairItensDaFatura(d, { texto: 'uma linha', competenciaRef: '2026-07' });

    expect(resultado.consumo).toEqual({ entrada: 500, saida: 80 });
    expect(d.usoIA.incrementos).toHaveLength(1);
    expect(d.usoIA.incrementos[0]?.uso).toEqual({ requisicoes: 1, tokensEntrada: 500, tokensSaida: 80 });
  });
});
