/**
 * Tela do Histórico: dashboard dos ciclos já fechados — gráficos de evolução
 * no topo, tabela mês a mês embaixo, drill-down por linha em `/historico/[cicloId]`.
 */
import { criarDeps } from '@/composition';
import { obterHistorico } from '@/application/historico';
import { formatBRL } from '@/shared/dinheiro';
import { EmptyState } from '@/components/ui';
import { GraficosHistorico } from '@/components/historico/graficos-historico';
import { TabelaHistorico } from '@/components/historico/tabela-historico';

export const dynamic = 'force-dynamic';

export default async function HistoricoPage() {
  const deps = await criarDeps();
  const estado = await obterHistorico(deps);

  if (estado.meses.length === 0) {
    return (
      <EmptyState
        titulo="Ainda não há ciclos fechados"
        descricao="Feche pelo menos um ciclo para ver o histórico."
      />
    );
  }

  return (
    <div className="mx-auto flex w-full flex-col gap-6 lg:max-w-5xl">
      <header>
        <h1 className="text-lg font-semibold text-fg">Histórico</h1>
        <p className="mt-1 text-sm text-muted">
          {estado.totais.meses} {estado.totais.meses === 1 ? 'ciclo fechado' : 'ciclos fechados'}.
        </p>
        <ul className="mt-3 flex flex-col gap-1 text-sm text-muted sm:flex-row sm:gap-6">
          {estado.mediasPoupancaReal.map((m) => (
            <li key={m.ciclos}>
              Média real — últimos {m.ciclos} ciclos:{' '}
              <span className="font-semibold text-fg">
                {m.mediaCents === null ? '—' : formatBRL(m.mediaCents)}
              </span>{' '}
              {m.mediaCents === null ? (
                <span className="text-xs text-faint">(nenhum ciclo com poupança real medida)</span>
              ) : (
                <span className="text-xs text-faint">
                  ({m.ciclosConsiderados} {m.ciclosConsiderados === 1 ? 'ciclo' : 'ciclos'})
                </span>
              )}
            </li>
          ))}
        </ul>
      </header>

      <GraficosHistorico estado={estado} />
      <TabelaHistorico estado={estado} />
    </div>
  );
}
