import { criarDeps } from '@/composition';
import { obterAnalise } from '@/application/analise';
import { EmptyState } from '@/components/ui';
import { RankingCorte } from '@/components/analise/ranking-corte';
import { AssinaturasDisfarcadas } from '@/components/analise/assinaturas-disfarcadas';

export const dynamic = 'force-dynamic';

export default async function AnalisePage() {
  const deps = await criarDeps();
  const estado = await obterAnalise(deps);

  if (estado.ciclosConsiderados === 0) {
    return (
      <EmptyState
        titulo="Ainda não há ciclos fechados"
        descricao="Feche pelo menos um ciclo para ver médias e recorrências."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-lg font-semibold text-fg">Análise de corte</h1>
        <p className="mt-1 text-sm text-muted">
          Média dos últimos {estado.ciclosConsiderados}{' '}
          {estado.ciclosConsiderados === 1 ? 'ciclo fechado' : 'ciclos fechados'}.
        </p>
      </header>

      <RankingCorte ranking={estado.ranking} />
      <AssinaturasDisfarcadas assinaturas={estado.assinaturas} />

      {estado.ranking.length === 0 && estado.assinaturas.length === 0 ? (
        <EmptyState
          titulo="Nenhum gasto variável recorrente"
          descricao="Sem despesas variáveis suficientes nos últimos ciclos fechados para montar um ranking."
        />
      ) : null}
    </div>
  );
}
