/**
 * Tela do copiloto. Com `IA_HABILITADA=false` a rota existe mas explica que a
 * camada está desligada — nem a sidebar a mostra nesse caso (app/layout.tsx).
 */
import { CopilotoChat } from '@/components/ia/copiloto-chat';
import { EmptyState } from '@/components/ui';
import { iaHabilitada } from '@/infrastructure/ia/config-ia';
import { SomenteDono } from '@/components/auth/somente-dono';

export const dynamic = 'force-dynamic';

export default function CopilotoPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-fg">Copiloto</h1>
        <p className="mt-1 text-sm text-muted">
          Responde sobre os seus números. Não lança gastos nem altera nada — isso continua sendo
          na tela.
        </p>
      </header>

      {iaHabilitada() ? (
        // A IA gasta dinheiro real da conta do dono, então é OWNER-only
        // (DA-3). A trava de verdade é `exigirOwner` dentro de `responder`;
        // isto evita mostrar a um VIEWER um chat que o servidor recusaria.
        <SomenteDono>
          <CopilotoChat />
        </SomenteDono>
      ) : (
        <EmptyState
          titulo="Camada de IA desligada"
          descricao="Preencha OPENAI_API_KEY e defina IA_HABILITADA=true no arquivo .env, depois reinicie o servidor."
        />
      )}
    </div>
  );
}
