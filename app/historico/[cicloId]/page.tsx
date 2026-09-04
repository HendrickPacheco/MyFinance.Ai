/**
 * Detalhe de um ciclo fechado (drill-down do histórico). Tela de LEITURA:
 * reusa os cards do ciclo atual (`app/ciclo/page.tsx`), mas sem
 * `RecalcularCicloButton` nem qualquer ação de edição — mês fechado não se
 * recalcula nem se edita por aqui.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { criarDeps } from '@/composition';
import { obterEstadoCicloPorId } from '@/application/ciclo-view';
import { ComposicaoVerbaCard } from '@/components/ciclo/composicao-verba-card';
import { RitmoCard } from '@/components/ciclo/ritmo-card';
import { ExtratoCiclo } from '@/components/ciclo/extrato-ciclo';

export const dynamic = 'force-dynamic';

function formatarDataCurta(data: string): string {
  const [, mes, dia] = data.split('-');
  return `${dia}/${mes}`;
}

export default async function HistoricoCicloPage({
  params,
}: {
  params: Promise<{ cicloId: string }>;
}) {
  const { cicloId } = await params;
  const deps = await criarDeps();
  const estado = await obterEstadoCicloPorId(deps, cicloId);

  if (estado === null) {
    notFound();
  }

  return (
    <div className="mx-auto w-full space-y-6 lg:max-w-3xl">
      <header className="space-y-2">
        <Link
          href="/historico"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
        >
          <ArrowLeft size={16} strokeWidth={1.8} aria-hidden="true" />
          Voltar ao histórico
        </Link>
        <div>
          <p className="text-sm uppercase tracking-widest text-muted">Ciclo fechado</p>
          <p className="tnum mt-0.5 text-sm text-faint">
            {formatarDataCurta(estado.ciclo.dataInicio)} – {formatarDataCurta(estado.ciclo.dataFim)}
          </p>
        </div>
      </header>

      <ComposicaoVerbaCard ciclo={estado.ciclo} />

      <RitmoCard
        ritmo={estado.ritmo}
        gastoRealizadoCents={estado.gastoRealizadoCents}
        verbaVariavelCents={estado.ciclo.verbaVariavelCents}
      />

      <ExtratoCiclo transacoes={estado.transacoes} categorias={estado.categorias} />
    </div>
  );
}
