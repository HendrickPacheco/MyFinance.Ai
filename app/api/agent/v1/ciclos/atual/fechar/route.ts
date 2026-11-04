import { ErroApi, rotaEscrita } from '@/agent-api';
import { fechamentoSchema } from '@/agent-api/schemas/ciclos';
import { descreverDestinoSobra, fecharCiclo, obterResumoParaFechar } from '@/application/fechamento';

/**
 * Fecha o ciclo pendente (o anterior ainda aberto, se houver) ou o atual —
 * a MESMA escolha que `obterResumoParaFechar` faz para o wizard. A resposta
 * anexa para onde a sobra foi (`destinoSobra`), além do `ciclo` resultante.
 */
export const dynamic = 'force-dynamic';

export const POST = rotaEscrita(
  { escopo: 'admin', body: fechamentoSchema, entidade: 'Ciclo', acao: 'ACTION', status: 200 },
  async ({ deps, body, auditar }) => {
    const resumo = await obterResumoParaFechar(deps);
    if (!resumo) throw new ErroApi(404, 'NAO_ENCONTRADO', 'Não há ciclo para fechar.');

    const cicloAntes = resumo.ciclo;
    const resultado = await fecharCiclo(deps, cicloAntes.id, {
      rendaRealizadaCents: body.rendaRealizadaCents,
      novaMetaPoupancaCents: body.novaMetaPoupancaCents ?? null,
      snapshotData: body.snapshotData,
      snapshotItens: body.snapshotItens,
      observacao: body.observacao ?? null,
    });

    const config = await deps.config.obter();
    const destinoSobra = config ? await descreverDestinoSobra(deps, config, resultado.sobraCents) : null;

    auditar({ entidadeId: cicloAntes.id, antes: cicloAntes, depois: resultado.ciclo });

    return { ...resultado, destinoSobra };
  },
);
