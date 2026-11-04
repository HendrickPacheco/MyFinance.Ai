import { describe, expect, it } from 'vitest';
import type { Cotacao } from '@/domain/model/entidades';
import type { FonteCotacaoPort } from '@/domain/ports/cotacao';
import { criarDeps } from './__fakes__/fakes-ciclo-fechamento';
import { obterCotacaoUsd } from './cotacao';

const cot = (data: string, taxaMicros = 5_000_000): Cotacao => ({
  data, moedaOrigem: 'USD', moedaDestino: 'BRL', taxaMicros, fonte: 'PTAX_BCB',
});

function montar(salva: Cotacao | null, fonte?: FonteCotacaoPort) {
  const deps = criarDeps({ hoje: '2026-11-04' });
  deps.fonteCotacao = fonte;
  return Promise.resolve(salva ? deps.cotacoes.salvar(salva) : null).then(() => deps);
}

function fonteSpy(resp: () => Promise<Cotacao | null>) {
  const f = { chamadas: 0, async buscarPtaxVenda() { f.chamadas++; return resp(); } };
  return f;
}

describe('obterCotacaoUsd', () => {
  it('cache de 1 dia: não chama a fonte', async () => {
    const f = fonteSpy(async () => cot('2026-11-04'));
    const deps = await montar(cot('2026-11-03'), f);
    const r = await obterCotacaoUsd(deps);
    expect(r.cotacao?.data).toBe('2026-11-03');
    expect(r.aviso).toBeNull();
    expect(f.chamadas).toBe(0);
  });

  it('cache velho: busca na fonte e salva', async () => {
    const f = fonteSpy(async () => cot('2026-11-04', 5_430_000));
    const deps = await montar(cot('2026-10-30'), f);
    const r = await obterCotacaoUsd(deps);
    expect(r.cotacao?.taxaMicros).toBe(5_430_000);
    expect((await deps.cotacoes.obter('2026-11-04'))?.taxaMicros).toBe(5_430_000);
  });

  it.each([
    ['devolve null', async () => null],
    ['lança', async (): Promise<Cotacao | null> => { throw new Error('rede'); }],
  ])('fonte %s: usa a salva com aviso', async (_n, resp) => {
    const deps = await montar(cot('2026-10-30'), fonteSpy(resp));
    const r = await obterCotacaoUsd(deps);
    expect(r.cotacao?.data).toBe('2026-10-30');
    expect(r.aviso).toContain('30/10/2026');
  });

  it('sem fonte e sem cache: null com aviso', async () => {
    const deps = await montar(null);
    const r = await obterCotacaoUsd(deps);
    expect(r.cotacao).toBeNull();
    expect(r.aviso).not.toBeNull();
  });
});

describe('obterCotacaoUsd com repositório quebrado', () => {
  it('ultimaAte lança: não rejeita, devolve null + aviso', async () => {
    const deps = await montar(null);
    deps.cotacoes.ultimaAte = async () => { throw new Error('db'); };
    const r = await obterCotacaoUsd(deps);
    expect(r.cotacao).toBeNull();
    expect(r.aviso).not.toBeNull();
  });
});
