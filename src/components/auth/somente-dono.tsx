import { EmptyState } from '@/components/ui';
import { criarDeps } from '@/composition';
import { ehOwner } from '@/domain/auth/permissoes';

/**
 * Portão de tela inteira para páginas cujo propósito é escrever (Ajustes,
 * Fechar ciclo, Backup). Um VIEWER que chegue nelas vê um aviso factual em vez
 * de um formulário que o servidor recusaria.
 *
 * Componente de SERVIDOR: o papel vem de `criarDeps()`, resolvido da sessão —
 * não do contexto do cliente. Ainda assim, isto continua sendo UX: a trava real
 * é `exigirOwner` dentro de cada caso de uso.
 */
export async function SomenteDono({ children }: { children: React.ReactNode }) {
  const deps = await criarDeps();
  if (ehOwner(deps.ator)) return <>{children}</>;

  return (
    <EmptyState
      titulo="Somente leitura"
      descricao="Seu acesso permite consultar as telas, mas não alterar configurações ou dados."
    />
  );
}
