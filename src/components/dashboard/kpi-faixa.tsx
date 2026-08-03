/**
 * Faixa de destaque do painel desktop (SPEC 11: "hierarquia brutal" — um
 * número domina, o resto é quieto). `restaHojeCents` é a figura herói; os
 * destaques do mês e o bloco de comprometido são grupos secundários, nunca
 * empatados em peso com o herói. Nunca soma verba variável com
 * fixos/parcelas/poupança — são números de blocos diferentes (regra 5).
 *
 * Rótulos são pelo que o usuário controla ("posso gastar"), nunca pela
 * implementação ("teto diário calculado") — SPEC 11.
 */
import { Badge } from '@/components/ui';
import { formatBRL } from '@/shared/dinheiro';
import { cn } from '@/lib/cn';
import type { KpisPainel } from '@/application/dashboard-tipos';

function tomHero(restaHojeCents: number, tetoHojeCents: number, emRecuperacao: boolean) {
  if (emRecuperacao) return { cor: 'text-recuperacao', aviso: null as string | null };
  if (restaHojeCents < 0) {
    return {
      cor: 'text-negativo',
      aviso: `Você passou ${formatBRL(-restaHojeCents)} do teto de hoje.`,
    };
  }
  if (tetoHojeCents > 0 && restaHojeCents <= tetoHojeCents * 0.15) {
    return { cor: 'text-atencao', aviso: 'Quase no limite de hoje.' };
  }
  return { cor: 'text-positivo', aviso: null };
}

type Tone = 'positivo' | 'negativo' | 'atencao';

function toneClassFor(tone?: Tone) {
  if (tone === 'positivo') return 'text-positivo';
  if (tone === 'negativo') return 'text-negativo';
  if (tone === 'atencao') return 'text-atencao';
  return 'text-fg';
}

function StatTile({
  rotulo,
  valor,
  tone,
  nota,
}: {
  rotulo: string;
  valor: string;
  tone?: Tone;
  nota?: string;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface px-4 py-4">
      <p className="text-xs uppercase tracking-wide text-muted">{rotulo}</p>
      <p className={cn('tnum mt-1 text-xl font-semibold', toneClassFor(tone))}>{valor}</p>
      {nota ? <p className="mt-1 text-xs text-muted">{nota}</p> : null}
    </div>
  );
}

/**
 * Duas cifras de "pago vs. falta pagar" num tile só, com peso visual menor
 * que os tiles principais (SPEC 11: não empilhar peso igual num 8º número
 * solto). É rastreamento — nunca some com verba variável nem com o herói.
 */
function StatTilePagamento({
  faltaPagarCents,
  jaPagueiCents,
}: {
  faltaPagarCents: number;
  jaPagueiCents: number;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface px-4 py-4">
      <p className="text-xs uppercase tracking-wide text-muted">Pagamento do mês</p>
      <dl className="mt-1.5 space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-xs text-muted">Falta pagar</dt>
          <dd
            className={cn(
              'tnum text-base font-semibold',
              faltaPagarCents > 0 ? 'text-atencao' : 'text-fg',
            )}
          >
            {formatBRL(faltaPagarCents)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-xs text-muted">Já paguei</dt>
          <dd className="tnum text-base font-semibold text-muted">{formatBRL(jaPagueiCents)}</dd>
        </div>
      </dl>
    </div>
  );
}

export function KpiFaixa({ kpis }: { kpis: KpisPainel }) {
  const {
    restaHojeCents,
    tetoHojeCents,
    gastoHojeCents,
    gastoRealizadoCents,
    saldoDisponivelCents,
    diasRestantes,
    diasTotais,
    emRecuperacao,
    custosFixosCents,
    totalGastosCents,
    metaEconomiaCents,
    saldoContaCents,
    faltaPagarCents,
    jaPagueiCents,
  } = kpis;

  const { cor, aviso } = tomHero(restaHojeCents, tetoHojeCents, emRecuperacao);
  const saldoContaNegativo = saldoContaCents < 0;

  return (
    <div className="space-y-4">
      {/* Herói: o único número que domina a tela. */}
      <section aria-label="Quanto posso gastar hoje" className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="rounded-[var(--radius-card)] border border-border bg-surface px-6 py-6 lg:col-span-2 lg:row-span-2">
          <div className="flex items-center justify-between">
            <p className="text-sm uppercase tracking-widest text-muted">Posso gastar hoje</p>
            {emRecuperacao ? <Badge tone="negativo">recuperação</Badge> : null}
          </div>
          <p className={cn('tnum mt-3 text-6xl font-bold leading-none tracking-tight', cor)}>
            {formatBRL(Math.max(restaHojeCents, 0))}
          </p>
          <p className="mt-4 tnum text-sm text-muted">
            {formatBRL(saldoDisponivelCents)} restantes ÷ {diasRestantes}{' '}
            {diasRestantes === 1 ? 'dia' : 'dias'} de ciclo
          </p>
          <p className="mt-1 tnum text-sm text-muted">
            teto de hoje {formatBRL(tetoHojeCents)} · gasto hoje {formatBRL(gastoHojeCents)}
          </p>
          {aviso ? <p className={cn('mt-2 text-sm', cor)}>{aviso}</p> : null}
        </div>

        {/* Destaques do mês — mesma verba variável do herói, outro ângulo. */}
        <StatTile
          rotulo="Ainda posso gastar no mês"
          valor={formatBRL(saldoDisponivelCents)}
          tone={saldoDisponivelCents < 0 ? 'negativo' : undefined}
          nota="Verba variável restante, para manter a meta de poupança"
        />
        <StatTile rotulo="Já gastei" valor={formatBRL(gastoRealizadoCents)} />
        <StatTile
          rotulo="Dias restantes"
          valor={`${diasRestantes} de ${diasTotais}`}
        />
      </section>

      {/* Bloco de comprometido — nunca aparece como disponível (regra 5). */}
      <section aria-label="Comprometido no mês">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">Comprometido no mês</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatTile rotulo="Total de gastos do mês" valor={formatBRL(totalGastosCents)} />
          <StatTile rotulo="Custo fixo" valor={formatBRL(custosFixosCents)} />
          <StatTile rotulo="Meta de economia do mês" valor={formatBRL(metaEconomiaCents)} />
          <StatTile
            rotulo="Saldo disponível"
            valor={formatBRL(saldoContaCents)}
            tone={saldoContaNegativo ? 'negativo' : 'positivo'}
            nota={saldoContaNegativo ? 'Gastos do mês já passaram a renda prevista' : 'Renda prevista menos total de gastos'}
          />
          <StatTilePagamento faltaPagarCents={faltaPagarCents} jaPagueiCents={jaPagueiCents} />
        </div>
      </section>
    </div>
  );
}
