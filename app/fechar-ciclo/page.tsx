import Link from 'next/link';
import { criarDeps } from '@/composition';
import { obterResumoParaFechar } from '@/application/fechamento';
import { EmptyState } from '@/components/ui';
import { FecharCicloWizard } from '@/components/fechar-ciclo/fechar-ciclo-wizard';

export const dynamic = 'force-dynamic';

export default async function FecharCicloPage() {
  const deps = await criarDeps();
  const resumo = await obterResumoParaFechar(deps);

  if (!resumo) {
    return (
      <EmptyState
        titulo="Nada para fechar"
        descricao="Ainda não há um ciclo para fechar."
        acao={
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center rounded-xl bg-accent px-5 text-sm font-medium text-accent-fg transition-all active:scale-[0.98] hover:brightness-110"
          >
            Voltar para Hoje
          </Link>
        }
      />
    );
  }

  return (
    <div className="mx-auto w-full lg:max-w-3xl">
      <FecharCicloWizard resumo={resumo} hojeISO={deps.relogio.hoje()} />
    </div>
  );
}
