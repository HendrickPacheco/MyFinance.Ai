import Link from 'next/link';
import { criarDeps } from '@/composition';
import { obterResumoParaFechar } from '@/application/fechamento';
import { EmptyState } from '@/components/ui';
import { FecharCicloWizard } from '@/components/fechar-ciclo/fechar-ciclo-wizard';

import { SomenteDono } from '@/components/auth/somente-dono';

export const dynamic = 'force-dynamic';

async function FecharCicloPageConteudo() {
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

/**
 * Tela de escrita: portão de papel (TASKS-AUTH S4.2). VIEWER vê um aviso
 * factual em vez do formulário. A trava real continua nos casos de uso.
 */
export default function FecharCicloPage() {
  return (
    <SomenteDono>
      <FecharCicloPageConteudo />
    </SomenteDono>
  );
}
