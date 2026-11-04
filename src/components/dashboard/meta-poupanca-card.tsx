import type { EstadoHome } from '@/application/home-tipos';
import { formatarNumeroBRL } from '@/shared/dinheiro';
import { Card, Valor } from './ui-home';

const R = 30;
const CIRC = 2 * Math.PI * R;

export function MetaPoupancaCard({ meta }: { meta: EstadoHome['metaPoupanca'] }) {
  const p = meta.progressoPercent;
  const semDado = meta.guardadoCents === null;
  return (
    <Card className="flex items-center justify-between">
      <div>
        <div className="text-[13px] font-medium text-muted">Meta de poupança</div>
        <div className="mb-0.5 mt-2 text-[32px] font-extrabold tracking-[-0.03em]">
          {semDado ? (
            <>
              <span className="text-faint">—</span>
              <span className="text-base font-semibold text-faint"> de {formatarNumeroBRL(meta.alvoCents)}</span>
            </>
          ) : (
            <Valor cents={meta.guardadoCents ?? 0} sufixo={`de ${formatarNumeroBRL(meta.alvoCents)}`} />
          )}
        </div>
        <div className="mt-1.5 text-[13px] text-faint">
          {meta.motivoSemGuardado ?? 'guardado no ciclo (estimado)'}
        </div>
      </div>
      <svg
        width="72"
        height="72"
        viewBox="0 0 72 72"
        className="flex-none"
        role="img"
        aria-label={semDado ? 'Guardado no ciclo indisponível' : `${p}% da meta de poupança`}
      >
        <circle cx="36" cy="36" r={R} fill="none" strokeWidth="8" className="stroke-track" />
        <circle
          cx="36"
          cy="36"
          r={R}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${(CIRC * p) / 100} ${CIRC}`}
          transform="rotate(-90 36 36)"
          className="stroke-accent"
        />
        <text x="36" y="41" textAnchor="middle" className="fill-fg text-[14px] font-bold">
          {semDado ? '—' : `${p}%`}
        </text>
      </svg>
    </Card>
  );
}
