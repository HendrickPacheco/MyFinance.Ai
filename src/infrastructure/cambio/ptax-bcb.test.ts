import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PtaxBcb } from './ptax-bcb';

const ok = (value: unknown[]) =>
  ({ ok: true, status: 200, json: async () => ({ value }) }) as Response;

describe('PtaxBcb', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('busca o dia e converte para micros', async () => {
    const f = vi.fn(async (_u: string | URL | Request) => ok([{ cotacaoVenda: 5.4306 }]));
    const r = await new PtaxBcb(f as unknown as typeof fetch).buscarPtaxVenda('2026-11-04');
    expect(String(f.mock.calls[0]![0])).toMatch(/@dataCotacao='11-04-2026'&\$format=json$/);
    expect(r).toEqual({
      data: '2026-11-04',
      taxaMicros: 5_430_600,
      fonte: 'PTAX_BCB',
      moedaOrigem: 'USD',
      moedaDestino: 'BRL',
    });
  });

  it('domingo: recua até o último dia útil', async () => {
    const f = vi.fn(async (u: string | URL | Request) =>
      String(u).includes("'10-30-2026'") ? ok([{ cotacaoVenda: 5.43 }]) : ok([]),
    );
    const r = await new PtaxBcb(f as unknown as typeof fetch).buscarPtaxVenda('2026-11-01');
    expect(r).toMatchObject({ data: '2026-10-30', taxaMicros: 5_430_000 });
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('timeout/abort -> null', async () => {
    const f = vi.fn(async () => {
      throw new DOMException('abort', 'AbortError');
    });
    expect(await new PtaxBcb(f as unknown as typeof fetch).buscarPtaxVenda('2026-11-04')).toBeNull();
  });

  it('HTTP 500 -> null', async () => {
    const f = vi.fn(async () => ({ ok: false, status: 500 }) as Response);
    expect(await new PtaxBcb(f as unknown as typeof fetch).buscarPtaxVenda('2026-11-04')).toBeNull();
  });

  it('8 dias vazios -> null após 8 chamadas', async () => {
    const f = vi.fn(async () => ok([]));
    expect(await new PtaxBcb(f as unknown as typeof fetch).buscarPtaxVenda('2026-11-04')).toBeNull();
    expect(f).toHaveBeenCalledTimes(8);
  });

  it('o timeout é um orçamento total: todas as chamadas do recuo compartilham o mesmo signal', async () => {
    const f = vi.fn(async (_u: string | URL | Request, _i?: RequestInit) => ok([]));
    await new PtaxBcb(f as unknown as typeof fetch).buscarPtaxVenda('2026-11-04');
    const sinais = new Set(f.mock.calls.map((c) => c[1]?.signal));
    expect(sinais.size).toBe(1);
    expect([...sinais][0]).toBeInstanceOf(AbortSignal);
  });

  it('orçamento estourado no meio do recuo -> para de buscar e devolve null', async () => {
    const f = vi.fn(async (_u: string | URL | Request, i?: RequestInit) => {
      await new Promise((r) => setTimeout(r, 15));
      i?.signal?.throwIfAborted();
      return ok([]);
    });
    const r = await new PtaxBcb(f as unknown as typeof fetch, { timeoutMs: 20 }).buscarPtaxVenda('2026-11-04');
    expect(r).toBeNull();
    expect(f.mock.calls.length).toBeLessThan(8);
  });
});
