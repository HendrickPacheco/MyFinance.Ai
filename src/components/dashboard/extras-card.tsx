import type { EstadoHome } from '@/application/home-tipos';
import { Barra, Card, Valor } from './ui-home';

export function ExtrasCard({ extras }: { extras: EstadoHome['extras'] }) {
  return (
    <Card>
      <div className="text-[13px] font-medium text-muted">Extras do mês</div>
      <div className="mb-0.5 mt-2 text-[32px] font-extrabold tracking-[-0.03em]">
        <Valor cents={extras.disponivelCents} sufixo="disponível" />
      </div>
      <div className="mt-1.5 text-[13px] text-subtle">para compras pontuais</div>
      <Barra fina percent={extras.progressoPercent} opacidade={0.35} className="mt-[18px]" />
    </Card>
  );
}
