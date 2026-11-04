import type { EstadoHome } from '@/application/home-tipos';
import { Barra, Card, Valor } from './ui-home';

export function ReservaCard({ reserva }: { reserva: EstadoHome['reserva'] }) {
  const sub =
    reserva.meses === null
      ? (reserva.motivoSemDado ?? 'sem dado para calcular')
      : `${reserva.meses.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} meses · meta ${reserva.metaMeses} meses`;
  return (
    <Card>
      <div className="text-[13px] font-medium text-muted">Reserva de emergência</div>
      <div className="mb-0.5 mt-2 text-[32px] font-extrabold tracking-[-0.03em]">
        <Valor cents={reserva.totalCents} />
      </div>
      <div className="mt-1.5 text-[13px] text-faint">{sub}</div>
      <Barra fina percent={reserva.progressoPercent} className="mt-[18px]" />
    </Card>
  );
}
