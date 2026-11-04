import type { EstadoHome } from '@/application/home-tipos';
import { cn } from '@/lib/cn';
import { Barra, Card, Valor } from './ui-home';

export function ExtrasCard({ extras }: { extras: EstadoHome['extras'] }) {
  const estourados = extras.disponivelCents < 0;
  return (
    <Card>
      <div className="text-[13px] font-medium text-muted">Extras do mês</div>
      <div
        className={cn(
          'mb-0.5 mt-2 text-[32px] font-extrabold tracking-[-0.03em]',
          estourados && 'text-negativo',
        )}
      >
        <Valor cents={extras.disponivelCents} sufixo={estourados ? 'estourados' : 'disponível'} />
      </div>
      <div className={cn('mt-1.5 text-[13px]', estourados ? 'text-negativo' : 'text-faint')}>
        {estourados ? 'o excedente reduz o seu dia a dia' : 'para compras pontuais'}
      </div>
      <Barra fina percent={extras.progressoPercent} opacidade={0.35} className="mt-[18px]" />
    </Card>
  );
}
