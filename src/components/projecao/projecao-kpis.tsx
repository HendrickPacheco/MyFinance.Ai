/**
 * Manchete + os três números de topo de `/projecao` (§3.4).
 *
 * A MANCHETE É A DONA DA FRASE. Ela é o terceiro reforço do fim de parcelamento
 * (os outros dois são o marcador sob o tick do gráfico e o badge na linha da
 * tabela) e é o único que funciona para quem não lê figura — por isso vem
 * primeiro, em texto corrido, e nenhum outro componente desta tela repete o
 * que ela já disse.
 *
 * Componente de servidor: só formata o que `obterResumoProjecao` já decidiu.
 * Nenhum cálculo aqui (CLAUDE.md regra 4) — nem sequer um `Math.min`.
 */
import { formatBRL } from '@/shared/dinheiro';
import { cn } from '@/lib/cn';
import type { ExtremoProjecao, ResumoProjecao } from '@/application/projecao-view';

function Kpi({
  rotulo,
  valor,
  nota,
  tone,
}: {
  rotulo: string;
  valor: string;
  nota: string;
  tone?: 'positivo' | 'negativo' | 'atencao';
}) {
  const cor =
    tone === 'positivo'
      ? 'text-positivo'
      : tone === 'negativo'
        ? 'text-negativo'
        : tone === 'atencao'
          ? 'text-atencao'
          : 'text-fg';

  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface px-4 py-4">
      <p className="text-xs uppercase tracking-wide text-muted">{rotulo}</p>
      <p className={cn('tnum mt-1 text-2xl font-semibold', cor)}>{valor}</p>
      <p className="mt-1 text-xs text-muted">{nota}</p>
    </div>
  );
}

function notaDoExtremo(extremo: ExtremoProjecao): string {
  return `em ${extremo.periodoLabel}`;
}

export function ProjecaoKpis({ resumo }: { resumo: ResumoProjecao }) {
  const { minima, maxima, mesesAbaixoDoPiso, totalMeses, manchete } = resumo;
  const algumAbaixoDoPiso = mesesAbaixoDoPiso > 0;

  return (
    <section
      aria-label="Resumo da projeção"
      className="rounded-[var(--radius-card)] border border-border bg-surface px-5 py-5"
    >
      <p className="text-base leading-relaxed text-fg lg:text-lg">{manchete}</p>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi
          rotulo="Verba livre mín."
          valor={formatBRL(minima.verbaLivreCents)}
          nota={notaDoExtremo(minima)}
          tone={minima.verbaLivreCents < 0 ? 'negativo' : undefined}
        />
        <Kpi
          rotulo="Verba livre máx."
          valor={formatBRL(maxima.verbaLivreCents)}
          nota={notaDoExtremo(maxima)}
          tone={maxima.verbaLivreCents > 0 ? 'positivo' : undefined}
        />
        <Kpi
          rotulo="Meses abaixo do piso"
          valor={`${String(mesesAbaixoDoPiso)} de ${String(totalMeses)}`}
          nota="Ciclos em que a verba livre por dia fica abaixo do piso"
          tone={algumAbaixoDoPiso ? 'atencao' : undefined}
        />
      </div>
    </section>
  );
}
