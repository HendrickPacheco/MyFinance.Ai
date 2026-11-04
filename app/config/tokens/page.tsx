import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { criarDeps } from '@/composition';
import { listarTokens } from '@/application/api-tokens';
import { TokensPainel } from '@/components/config/tokens-painel';
import { SomenteDono } from '@/components/auth/somente-dono';

export const dynamic = 'force-dynamic';

async function TokensPageConteudo() {
  const deps = await criarDeps();
  const tokens = await listarTokens(deps);

  return (
    <div className="mx-auto w-full space-y-6 lg:max-w-4xl">
      <Link href="/config" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft size={16} /> Configuração
      </Link>

      <header>
        <h1 className="text-2xl font-semibold text-fg">Tokens da API do agente</h1>
        <p className="mt-1 text-sm text-muted">
          Credenciais para um agente de IA externo ler e gravar dados em seu lugar, pelos mesmos
          casos de uso das telas. Cada escrita feita por token fica registrada em{' '}
          <Link href="/config/auditoria" className="underline">
            Auditoria
          </Link>
          .
        </p>
      </header>

      <TokensPainel tokens={tokens} />
    </div>
  );
}

/**
 * Tela de escrita: portão de papel (TASKS-AUTH S4.2). VIEWER vê um aviso
 * factual em vez do formulário. A trava real continua em `criarToken`
 * (`exigirOwner`, primeira linha).
 */
export default function TokensPage() {
  return (
    <SomenteDono>
      <TokensPageConteudo />
    </SomenteDono>
  );
}
