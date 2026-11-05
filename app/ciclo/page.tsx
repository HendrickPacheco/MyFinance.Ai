/**
 * Tela do Ciclo (SPEC 7): composição da verba, ritmo/projeção e extrato do
 * ciclo atual com ações de edição/estorno/exclusão.
 */
import { criarDeps } from '@/composition';
import { obterEstadoCiclo } from '@/application/ciclo-view';
import { ComposicaoVerbaCard } from '@/components/ciclo/composicao-verba-card';
import { RitmoCard } from '@/components/ciclo/ritmo-card';
import { ExtratoCiclo } from '@/components/ciclo/extrato-ciclo';
import { RendaCicloAcoes } from '@/components/ciclo/renda-ciclo-acoes';
import { RecalcularCicloButton } from '@/components/ciclo/recalcular-ciclo-button';

export const dynamic = 'force-dynamic';

export default async function CicloPage() {
  const deps = await criarDeps();
  const estado = await obterEstadoCiclo(deps);
  const config = await deps.config.obter();

  return (
    <div className="mx-auto w-full space-y-6 lg:max-w-3xl">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-widest text-muted">Ciclo atual</p>
          <p className="tnum mt-0.5 text-sm text-faint">
            {formatarDataCurta(estado.ciclo.dataInicio)} – {formatarDataCurta(estado.ciclo.dataFim)}
          </p>
        </div>
        <RecalcularCicloButton />
      </header>

      <ComposicaoVerbaCard
        ciclo={estado.ciclo}
        divisao={estado.divisao}
        diaADiaDiarioCents={estado.diaADiaDiarioCents}
      />

      {!estado.ciclo.fechado ? (
        <RendaCicloAcoes
          cicloId={estado.ciclo.id}
          moeda={config?.moedaRenda ?? 'BRL'}
          rendaConfirmada={estado.renda.confirmada}
        />
      ) : null}

      <RitmoCard
        ritmo={estado.ritmo}
        gastoRealizadoCents={estado.gastoRealizadoCents}
        verbaVariavelCents={estado.ciclo.verbaVariavelCents}
      />

      <ExtratoCiclo transacoes={estado.transacoes} categorias={estado.categorias} />
    </div>
  );
}

function formatarDataCurta(data: string): string {
  const [, mes, dia] = data.split('-');
  return `${dia}/${mes}`;
}
