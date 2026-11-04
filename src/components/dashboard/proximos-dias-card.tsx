import Link from 'next/link';
import type { EstadoHome } from '@/application/home-tipos';
import { formatarNumeroBRL } from '@/shared/dinheiro';
import { Card } from './ui-home';
import { iconeDaConta } from './icone-conta';
import { PagarBotao } from './pagar-botao';

export function ProximosDiasCard({ proximos7Dias }: { proximos7Dias: EstadoHome['proximos7Dias'] }) {
  const { itens, total } = proximos7Dias;
  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-base font-bold tracking-[-0.01em]">Próximos 7 dias</h3>
        <span className="text-[13px] font-medium text-muted">
          {total} {total === 1 ? 'conta' : 'contas'}
        </span>
      </div>
      {itens.length === 0 ? (
        <p className="py-3 text-sm text-faint">Nada vence nos próximos 7 dias.</p>
      ) : (
        itens.map((i) => {
          const Icone = iconeDaConta(i.nome, i.tipo);
          return (
            <div key={`${i.tipo}-${i.id}`} className="flex items-center gap-3.5 border-t border-line py-3 first:border-t-0 max-[760px]:gap-2.5">
              <div className="grid size-10 flex-none place-items-center rounded-xl bg-accent-soft text-accent">
                <Icone size={18} aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <b className="block truncate text-sm max-[760px]:whitespace-normal font-semibold">{i.nome}</b>
                <span className="text-xs text-faint">{i.rotuloData}</span>
              </div>
              <div className="whitespace-nowrap text-sm font-bold">R$ {formatarNumeroBRL(i.valorCents)}</div>
              <PagarBotao tipo={i.tipo} id={i.id} />
            </div>
          );
        })
      )}
      <Link href="/custos" className="mt-2 block border-t border-line pt-3.5 text-sm font-semibold text-accent no-underline">
        Ver todas as contas →
      </Link>
    </Card>
  );
}
