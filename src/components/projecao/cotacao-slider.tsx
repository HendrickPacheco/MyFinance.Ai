'use client';

/**
 * Slider da cotação simulada do dólar (só renda em USD). Escreve `?cotacao=` na
 * URL — mesma ideia do horizonte: o estado mora no link e a page continua
 * Server Component. Sem conta de dinheiro aqui: o valor é só texto "5.43" que
 * o servidor parseia (`lerCotacao`).
 */
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { COTACAO_MAX_MICROS, COTACAO_MIN_MICROS } from '@/lib/projecao-cotacao';

const paraTexto = (micros: number) => (micros / 1_000_000).toFixed(2);

export function CotacaoSlider({
  taxaMicros,
  simulada,
}: {
  taxaMicros: number | null;
  simulada: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const semCotacao = taxaMicros === null;
  const [valor, setValor] = useState(paraTexto(taxaMicros ?? COTACAO_MIN_MICROS));
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => setValor(paraTexto(taxaMicros ?? COTACAO_MIN_MICROS)), [taxaMicros]);
  useEffect(() => () => clearTimeout(timer.current), []);

  function navegar(cotacao: string | null) {
    const next = new URLSearchParams(params.toString());
    if (cotacao === null) next.delete('cotacao');
    else next.set('cotacao', cotacao);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function aoMudar(texto: string) {
    setValor(texto);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => navegar(texto), 300);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface px-4 py-3">
      <label htmlFor="cotacao-slider" className="text-sm text-muted">
        Cotação do dólar
      </label>
      <input
        id="cotacao-slider"
        type="range"
        min={paraTexto(COTACAO_MIN_MICROS)}
        max={paraTexto(COTACAO_MAX_MICROS)}
        step="0.01"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        className="min-h-[44px] min-w-[10rem] flex-1 accent-[var(--color-accent,currentColor)]"
      />
      {semCotacao ? (
        <span className="text-sm text-muted">sem cotação — mova para simular</span>
      ) : (
        <span className="tnum text-sm font-medium text-fg">R$ {valor.replace('.', ',')}</span>
      )}
      {simulada ? (
        <button
          type="button"
          onClick={() => navegar(null)}
          className="min-h-[44px] rounded-lg border border-border px-3 text-sm text-muted hover:bg-surface-2 hover:text-fg"
        >
          Voltar à cotação do dia
        </button>
      ) : null}
    </div>
  );
}
