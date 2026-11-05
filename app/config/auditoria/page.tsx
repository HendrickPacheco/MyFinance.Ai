import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { criarDeps } from '@/composition';
import { listarAuditoriaAgente } from '@/application/auditoria';
import { AuditoriaPainel } from '@/components/config/auditoria-painel';
import { SomenteDono } from '@/components/auth/somente-dono';

export const dynamic = 'force-dynamic';

const LIMITE_INICIAL = 50;

async function AuditoriaPageConteudo() {
  const deps = await criarDeps();
  const pagina = await listarAuditoriaAgente(deps, { dryRun: false, limite: LIMITE_INICIAL });

  return (
    <div className="mx-auto w-full space-y-6 lg:max-w-4xl">
      <Link href="/config" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft size={16} /> Configuração
      </Link>

      <header>
        <h1 className="text-2xl font-semibold text-fg">Auditoria do agente</h1>
        <p className="mt-1 text-sm text-muted">
          Tudo que um token da{' '}
          <Link href="/config/tokens" className="underline">
            API do agente
          </Link>{' '}
          gravou em seu lugar.
        </p>
      </header>

      <AuditoriaPainel paginaInicial={pagina} />
    </div>
  );
}

/** Auditoria é OWNER-only (mesma guarda de `listarAuditoriaAgente`), como a memória do copiloto (D-12). */
export default function AuditoriaPage() {
  return (
    <SomenteDono>
      <AuditoriaPageConteudo />
    </SomenteDono>
  );
}
