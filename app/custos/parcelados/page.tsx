import { criarDeps } from '@/composition';
import { obterEstadoParcelados } from '@/application/parcelados-view';
import { ParceladosPainel } from '@/components/custos/parcelados-painel';
import { SomenteDono } from '@/components/auth/somente-dono';

export const dynamic = 'force-dynamic';

/**
 * Fase 8 do TASKS-CUSTOS. O layout, a barra de totais e as abas continuam no
 * `app/custos/layout.tsx` — esta página só troca o corpo.
 *
 * O OBJETO DESTA TELA É A COMPRA, não a parcela (§3.2). `/ciclo` continua
 * sendo o lugar de ver parcela a parcela do mês; aqui a pergunta é outra:
 * quanto cada compra consome do teto por mês, e quando a verba respira.
 */
async function CustosParceladosConteudo() {
  const deps = await criarDeps();
  const estado = await obterEstadoParcelados(deps);
  return <ParceladosPainel estado={estado} />;
}

/**
 * Tela de escrita: portão de papel (TASKS-AUTH §4.2). VIEWER vê um aviso
 * factual em vez do CRUD. A trava real continua nos casos de uso.
 */
export default function CustosParceladosPage() {
  return (
    <SomenteDono>
      <CustosParceladosConteudo />
    </SomenteDono>
  );
}
