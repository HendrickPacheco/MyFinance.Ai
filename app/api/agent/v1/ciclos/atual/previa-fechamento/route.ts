import { ErroApi, rotaAgente } from '@/agent-api';
import { descreverDestinoSobra, obterResumoParaFechar } from '@/application/fechamento';

/**
 * Prévia do fechamento (o mesmo `obterResumoParaFechar` que o wizard usa):
 * sobra, transações sem categoria, sugestão de meta, itens de patrimônio
 * sugeridos e para onde a sobra iria — sem fechar nada.
 */
export const dynamic = 'force-dynamic';

export const GET = rotaAgente({ escopo: 'read' }, async ({ deps }) => {
  const resumo = await obterResumoParaFechar(deps);
  if (!resumo) throw new ErroApi(404, 'NAO_ENCONTRADO', 'Não há ciclo para fechar.');

  const config = await deps.config.obter();
  const destinoSobra = config ? await descreverDestinoSobra(deps, config, resumo.sobraCents) : null;

  return { ...resumo, destinoSobra };
});
