import { criarDeps } from '@/composition';
import { obterEstadoVariaveis, type ParamsVariaveis } from '@/application/variaveis-view';
import { formatBRL } from '@/shared/dinheiro';
import { ExtratoVariaveis } from '@/components/transacoes/extrato-variaveis';
import { VariaveisFiltros } from '@/components/custos/variaveis-filtros';

export const dynamic = 'force-dynamic';

/**
 * `/custos/variaveis` (TASKS-CUSTOS Fase 9): o extrato de gastos variáveis num
 * recorte de PERÍODO, multi-ciclo, com filtros de período, categoria e método.
 *
 * A lista é o MESMO componente do painel desktop (`ExtratoVariaveis`), só que
 * com `escopo="periodo"` — a extração veio antes desta tela justamente para
 * esta página não virar a terceira cópia do markup (§5 débito 1).
 *
 * O filtro inteiro vive na URL (Server Component): deep-link, botão voltar, e
 * o total sempre somado no servidor sobre as mesmas linhas que a tela mostra.
 *
 * R4: parcelas e gastos de provisão não entram nesta lista nem neste total —
 * quem decide isso é `contaComoVerbaVariavel` (`domain/finance/teto.ts`), via
 * `extratoTransacoesVariaveis`, e não código desta página.
 */
export default async function CustosVariaveisPage({
  searchParams,
}: {
  searchParams: Promise<ParamsVariaveis>;
}) {
  const deps = await criarDeps();
  const estado = await obterEstadoVariaveis(deps, await searchParams);

  return (
    <div className="space-y-4">
      <VariaveisFiltros
        filtro={estado.filtro}
        presets={estado.presets}
        categorias={estado.categorias}
        metodos={estado.metodos}
      />

      {/* Total SEMPRE visível — inclusive quando o recorte não devolve nada,
          caso em que o card abaixo mostra só o estado vazio. */}
      <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-2xl border border-border bg-surface-2/40 px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-faint">Total no recorte</p>
          <p className="tnum mt-0.5 text-sm text-muted">
            {estado.periodoLabel} ·{' '}
            {estado.quantidade === 1 ? '1 lançamento' : `${estado.quantidade} lançamentos`}
          </p>
        </div>
        <p className="tnum text-2xl font-semibold text-fg">{formatBRL(estado.totalCents)}</p>
      </div>

      <ExtratoVariaveis
        escopo="periodo"
        transacoes={estado.linhas}
        totalCents={estado.totalCents}
        programadasCents={estado.programadasCents}
        categoriasLancamento={estado.categorias}
      />
    </div>
  );
}
