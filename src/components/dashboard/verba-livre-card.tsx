import Link from 'next/link';
import type { EstadoHome } from '@/application/home-tipos';
import { formatarRotuloGrafico } from '@/shared/dinheiro';
import { Card, Valor } from './ui-home';

const X0 = 30;
const X1 = 520;
const Y_MAX = 44;
const Y_MIN = 162;
const BASE = 200;

export function VerbaLivreCard({ verbaLivre }: { verbaLivre: EstadoHome['verbaLivre'] }) {
  const { pontos, faixaParcelasTerminando: faixa } = verbaLivre;
  const n = pontos.length;
  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-base font-bold tracking-[-0.01em]">Verba livre nos próximos meses</h3>
        <span className="text-[13px] font-medium text-muted">projeção</span>
      </div>
      {n < 2 ? (
        <p className="py-3 text-sm text-faint">Sem projeção disponível.</p>
      ) : (
        <Link href="/projecao" className="block text-inherit no-underline">
          <GraficoVerba pontos={pontos} faixa={faixa} ultimoCents={verbaLivre.ultimoCents} ultimoMes={verbaLivre.ultimoMes} />
        </Link>
      )}
    </Card>
  );
}

function GraficoVerba({
  pontos,
  faixa,
  ultimoCents,
  ultimoMes,
}: {
  pontos: EstadoHome['verbaLivre']['pontos'];
  faixa: EstadoHome['verbaLivre']['faixaParcelasTerminando'];
  ultimoCents: number;
  ultimoMes: string;
}) {
  const n = pontos.length;
  const vals = pontos.map((p) => p.verbaLivreCents);
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const xs = pontos.map((_, i) => X0 + ((X1 - X0) * i) / (n - 1));
  const ys = vals.map((v) => (max === min ? 103 : Y_MIN - ((v - min) / (max - min)) * (Y_MIN - Y_MAX)));
  const xAt = (i: number) => xs[i] ?? 0;
  const yAt = (i: number) => ys[i] ?? 0;
  const curva = xs.reduce((d, x, i) => {
    if (i === 0) return `M${x},${yAt(0)}`;
    const m = (xAt(i - 1) + x) / 2;
    return `${d} C${m},${yAt(i - 1)} ${m},${yAt(i)} ${x},${yAt(i)}`;
  }, '');
  const rotulo = 'font-[500] text-[11px]';
  return (
    <>
      <div className="mb-3 mt-2 text-[32px] font-extrabold tracking-[-0.03em]">
        <Valor cents={ultimoCents} sufixo={ultimoMes ? `em ${ultimoMes}` : undefined} />
      </div>
      <svg viewBox="0 0 550 232" width="100%" role="img" aria-label="Projeção da verba livre por mês">
        <defs>
          <linearGradient id="verba-livre-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--color-accent)" stopOpacity=".22" />
            <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {faixa ? (
          <>
            <rect
              x={xAt(faixa.inicioIdx) - 30}
              y="20"
              width={xAt(faixa.fimIdx) - xAt(faixa.inicioIdx) + 60}
              height="180"
              rx="10"
              fill="var(--color-accent-chip)"
            />
            <text
              x={(xAt(faixa.inicioIdx) + xAt(faixa.fimIdx)) / 2}
              y="36"
              textAnchor="middle"
              fill="var(--color-accent)"
              className="text-[11px] font-semibold"
            >
              parcelas terminando
            </text>
          </>
        ) : null}
        <line x1="20" y1={BASE} x2="535" y2={BASE} stroke="var(--color-border)" />
        <path d={`${curva} L${X1},${BASE} L${X0},${BASE}Z`} fill="url(#verba-livre-grad)" />
        <path d={curva} fill="none" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" />
        {pontos.map((p, i) => (
          <g key={`${p.rotulo}-${i}`}>
            <circle cx={xAt(i)} cy={yAt(i)} r="4" fill="var(--color-surface)" stroke="var(--color-accent)" strokeWidth="2.5" />
            <text x={xAt(i)} y={yAt(i) - 12} textAnchor="middle" fill="var(--color-fg)" className="text-[11px] font-bold">
              {formatarRotuloGrafico(p.verbaLivreCents, i === n - 1)}
            </text>
            <text x={xAt(i)} y="222" textAnchor="middle" fill="var(--color-faint)" className={rotulo}>
              {p.rotulo}
            </text>
          </g>
        ))}
      </svg>
    </>
  );
}
