import { Info } from 'lucide-react';
import { BotaoRecalcularCiclo } from '@/components/config/recalcular-ciclo';
import type { PreviaRecalculo } from '@/application/ciclos';
import { formatBRL } from '@/shared/dinheiro';
import { formatarDataCurta, type DataCivil } from '@/shared/data';

export interface AvisoCicloCongeladoProps {
  inicio: DataCivil;
  fim: DataCivil;
  /** Primeiro dia do próximo ciclo — a data em que a mudança passa a valer. */
  proximoInicio: DataCivil;
  verbaCongeladaCents: number;
  previaRecalculo: PreviaRecalculo | null;
}

/**
 * Banner PERSISTENTE do topo de `/custos/fixos` (TASKS-CUSTOS §4.3 item 1).
 * Não é toast e não some: o congelamento é uma regra permanente da tela, e
 * quem chega nela depois que um toast expirou merece a mesma informação.
 *
 * Visual `bg-surface-2` + `Info` em `text-accent`, deliberadamente NÃO
 * `text-atencao`: isto é regra do produto, não problema. Amarelo diário vira
 * ruído e o dono para de ler os avisos que realmente importam.
 *
 * Server Component: só formata props. A única parte interativa é o botão de
 * recalcular, que já é cliente por conta própria.
 */
export function AvisoCicloCongelado({
  inicio,
  fim,
  proximoInicio,
  verbaCongeladaCents,
  previaRecalculo,
}: AvisoCicloCongeladoProps) {
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-card)] bg-surface-2 p-4 sm:flex-row sm:items-start">
      <Info size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-fg">
          Mudanças em custos fixos e provisões valem a partir do próximo ciclo (
          <span className="tnum">{formatarDataCurta(proximoInicio)}</span>).
        </p>
        <p className="tnum mt-1 text-sm text-muted">
          A verba do ciclo atual ({formatarDataCurta(inicio)} – {formatarDataCurta(fim)}) está
          congelada em {formatBRL(verbaCongeladaCents)}.
        </p>
      </div>
      <BotaoRecalcularCiclo previa={previaRecalculo} variant="ghost" className="shrink-0" />
    </div>
  );
}
