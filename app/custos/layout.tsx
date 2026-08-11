import type { ReactNode } from 'react';
import { criarDeps } from '@/composition';
import { obterResumoMensalCustos } from '@/application/custos-view';
import { ContentHeader } from '@/components/layout/content-header';
import { BarraTotais } from '@/components/custos/barra-totais';
import { CustosTabs } from '@/components/custos/custos-tabs';

export const dynamic = 'force-dynamic';

/**
 * Chassi da seção Custos: cabeçalho, barra de totais e as três abas.
 *
 * As abas são SUB-ROTAS REAIS (`/custos/fixos`, `/custos/parcelados`,
 * `/custos/variaveis`), nunca estado de cliente — deep-link e botão voltar
 * dependem disso, e o app é 100% Server Components com `revalidatePath`.
 *
 * A barra de totais vive aqui, acima das abas, porque a pergunta que a seção
 * responde é comparativa: "quanto do meu mês é fixo, quanto é parcela, quanto
 * sobra livre". Repeti-la por aba destruiria a comparação e triplicaria a
 * consulta.
 */
export default async function CustosLayout({ children }: { children: ReactNode }) {
  const deps = await criarDeps();
  const resumo = await obterResumoMensalCustos(deps);

  return (
    <div className="mx-auto w-full space-y-6 lg:max-w-5xl">
      <ContentHeader titulo="Custos" periodo={resumo.periodoLabel} />

      <div className="lg:hidden">
        <h1 className="text-xl font-semibold text-fg">Custos</h1>
        <p className="tnum mt-0.5 text-sm text-muted">{resumo.periodoLabel}</p>
      </div>

      <BarraTotais resumo={resumo} />
      <CustosTabs />

      {children}
    </div>
  );
}
