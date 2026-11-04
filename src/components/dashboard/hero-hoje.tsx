import type { EstadoHome } from '@/application/home-tipos';
import { formatBRL } from '@/shared/dinheiro';
import { Barra, Card, Valor } from './ui-home';

export function HeroHoje({ hero }: { hero: EstadoHome['hero'] }) {
  return (
    <Card className="grid grid-cols-2 items-end gap-8 bg-gradient-to-br from-surface from-55% to-accent-soft p-8 max-[760px]:grid-cols-1 max-[760px]:gap-5 max-[760px]:p-6">
      <div>
        <div className="text-[13px] font-medium text-muted">Posso gastar hoje</div>
        <div className="mb-3 mt-2.5 text-[76px] font-extrabold leading-none tracking-[-0.04em] max-[760px]:text-[64px]">
          <Valor cents={hero.possoGastarHojeCents} simboloClassName="mr-1.5 text-[32px] font-bold" />
        </div>
        <div className="text-[13px] font-medium text-muted">
          <span
            className={
              hero.ritmoOk
                ? 'mr-1.5 inline-block size-2 rounded-full bg-positivo-dot shadow-[0_0_0_3px_var(--color-positivo-soft)]'
                : 'mr-1.5 inline-block size-2 rounded-full bg-atencao shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-atencao)_20%,transparent)]'
            }
          />
          {hero.ritmoOk ? 'dia a dia · ritmo ok' : 'dia a dia · acima do ritmo'}
        </div>
      </div>
      <div>
        <Barra percent={hero.progressoPercent} />
        <div className="mt-2.5 flex justify-between text-[13px] text-muted">
          <span>
            <b className="text-fg">{formatBRL(hero.usadoDiaADiaCents)}</b> de{' '}
            {formatBRL(hero.diaADiaCents)} usados no mês
          </span>
          <span>{hero.diasRestantes} dias restantes</span>
        </div>
      </div>
    </Card>
  );
}
