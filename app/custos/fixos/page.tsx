import { criarDeps } from '@/composition';
import { obterEstadoCustosFixos, obterResumoMensalCustos } from '@/application/custos-view';
import { AvisoCicloCongelado } from '@/components/custos/aviso-ciclo-congelado';
import { FixosPainel } from '@/components/custos/fixos-painel';
import { ProvisoesPainel } from '@/components/custos/provisoes-painel';
import { SomenteDono } from '@/components/auth/somente-dono';

export const dynamic = 'force-dynamic';

async function CustosFixosConteudo() {
  const deps = await criarDeps();
  // Duas leituras independentes e de tamanho fixo (nenhuma consulta por
  // linha): o resumo do ciclo e o estado da tela, esta última já trazendo a
  // contagem de pagamentos AGRUPADA e a prévia do recálculo.
  const [resumo, estado] = await Promise.all([
    obterResumoMensalCustos(deps),
    obterEstadoCustosFixos(deps),
  ]);

  return (
    <div className="space-y-6">
      <AvisoCicloCongelado
        inicio={resumo.inicio}
        fim={resumo.fim}
        proximoInicio={resumo.proximoInicio}
        verbaCongeladaCents={resumo.verbaVariavelCents}
        previaRecalculo={estado.previaRecalculo}
      />

      <FixosPainel
        linhas={estado.linhas}
        categorias={estado.categorias}
        proximoInicio={resumo.proximoInicio}
      />
      <ProvisoesPainel provisoes={estado.provisoes} proximoInicio={resumo.proximoInicio} />
    </div>
  );
}

/**
 * Tela de escrita: portão de papel (TASKS-AUTH S4.2). VIEWER vê um aviso
 * factual em vez do CRUD. A trava real continua nos casos de uso.
 */
export default function CustosFixosPage() {
  return (
    <SomenteDono>
      <CustosFixosConteudo />
    </SomenteDono>
  );
}
