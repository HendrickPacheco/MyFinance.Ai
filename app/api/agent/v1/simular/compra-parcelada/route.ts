import { rotaAgente } from '@/agent-api';
import { bodySimularCompraParceladaSchema } from '@/agent-api/schemas/ciclos';
import { simularCompraParcelada } from '@/application/ia/ferramentas/projecao';

/**
 * Pré-mortem de uma compra parcelada: projeta com e sem a compra e devolve o
 * delta por ciclo. SÓ LEITURA — nada é gravado — por isso `POST` aqui usa
 * `rotaAgente` (escopo `read`) em vez de `rotaEscrita`, lendo o corpo à mão.
 */
export const dynamic = 'force-dynamic';

export const POST = rotaAgente({ escopo: 'read' }, async ({ deps, req }) => {
  const corpoTexto = await req.text();
  const corpoJson: unknown = corpoTexto.trim() === '' ? {} : JSON.parse(corpoTexto);
  const dados = bodySimularCompraParceladaSchema.parse(corpoJson);

  return simularCompraParcelada(deps, {
    descricao: dados.descricao,
    valorTotalCents: dados.valorTotalCents,
    numParcelas: dados.numParcelas,
    dataCompra: dados.dataCompra ?? null,
    numCiclos: dados.numCiclos ?? null,
  });
});
