/**
 * Histórico de snapshots (SPEC 5.6). Componente apresentacional — server-safe.
 */
import { formatBRL } from '@/shared/dinheiro';
import type { SnapshotPatrimonio } from '@/domain/model/entidades';

function formatarDataLonga(data: string): string {
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

export function HistoricoSnapshots({ snapshots }: { snapshots: SnapshotPatrimonio[] }) {
  if (snapshots.length === 0) return null;

  return (
    <ul className="divide-y divide-border">
      {snapshots.map((s) => (
        <li key={s.id} className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm font-medium text-fg">{formatarDataLonga(s.data)}</p>
            <p className="text-xs text-muted">
              {s.itens.length} {s.itens.length === 1 ? 'item' : 'itens'}
            </p>
          </div>
          <p className="tnum text-sm font-semibold text-fg">{formatBRL(s.totalCents)}</p>
        </li>
      ))}
    </ul>
  );
}
