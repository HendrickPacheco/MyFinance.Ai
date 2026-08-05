/**
 * Tela de auditoria da memória do copiloto (Fase E, tarefa E7).
 *
 * OWNER-only (decisão D-12): memória contém plano e contexto de vida, mais
 * sensível que os números que um VIEWER já enxerga. A trava de verdade é
 * `exigirOwner` dentro de `listarMemorias`; `SomenteDono` só evita renderizar
 * uma tela que o servidor recusaria.
 */
import Link from 'next/link';
import { EmptyState } from '@/components/ui';
import { SomenteDono } from '@/components/auth/somente-dono';
import { GerenciarMemoria } from '@/components/ia/gerenciar-memoria';
import { listarMemorias } from '@/application/memoria';
import { ehOwner } from '@/domain/auth/permissoes';
import { criarDeps } from '@/composition';
import { iaHabilitada } from '@/infrastructure/ia/config-ia';

export const dynamic = 'force-dynamic';

export default async function MemoriaPage() {
  if (!iaHabilitada()) {
    return (
      <EmptyState
        titulo="Camada de IA desligada"
        descricao="Preencha OPENAI_API_KEY e defina IA_HABILITADA=true no arquivo .env, depois reinicie o servidor."
      />
    );
  }

  // `listarMemorias` LANÇA para quem não é dono (D-12). Checar o papel antes
  // evita que a página de um VIEWER exploda em vez de renderizar o aviso de
  // `SomenteDono`.
  const deps = await criarDeps();
  const memorias = ehOwner(deps.ator)
    ? await listarMemorias(deps, { incluirArquivadas: true })
    : [];

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/copiloto"
          className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
        >
          ← Copiloto
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-fg">O que o copiloto lembra</h1>
        <p className="mt-1 text-sm text-muted">
          Planos, preferências e contexto que ele considera nas respostas. Nunca valores: o número
          de hoje é falso amanhã, então dinheiro sempre sai do motor de cálculo, na hora.
        </p>
      </header>

      <SomenteDono>
        <GerenciarMemoria iniciais={memorias} />
      </SomenteDono>
    </div>
  );
}
