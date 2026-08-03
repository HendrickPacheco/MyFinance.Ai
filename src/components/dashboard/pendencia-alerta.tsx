/**
 * Aviso de ciclo anterior sem fechar — nunca bloqueia (regra 8), só avisa.
 * Mesmo tratamento visual usado na tela Hoje (`app/page.tsx`).
 */
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import type { Ciclo } from '@/domain/model/entidades';

export function PendenciaAlerta({ pendencia }: { pendencia: Ciclo | null }) {
  if (!pendencia) return null;

  return (
    <Link
      href="/fechar-ciclo"
      className="flex items-center gap-2 rounded-xl border border-atencao/40 bg-atencao/10 px-4 py-3 text-sm text-atencao"
    >
      <AlertTriangle size={16} />
      Ciclo anterior aberto — toque para fechar quando puder.
    </Link>
  );
}
