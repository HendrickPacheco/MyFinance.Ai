import { rotaAgente } from '@/agent-api';
import { bodySimularRendaSchema } from '@/agent-api/schemas/ciclos';
import { obterSimulacaoRenda } from '@/application/renda-hipotetica';

/**
 * "Se minha renda cair para X, dou conta das despesas?" SÓ LEITURA —
 * `rotaAgente` (escopo `read`) com `POST`, corpo lido à mão. Nunca edita a
 * Config; o ciclo em curso permanece congelado (SPEC 5.2,
 * `cicloAtualCongelado` na resposta).
 */
export const dynamic = 'force-dynamic';

export const POST = rotaAgente({ escopo: 'read' }, async ({ deps, req }) => {
  const corpoTexto = await req.text();
  const corpoJson: unknown = corpoTexto.trim() === '' ? {} : JSON.parse(corpoTexto);
  const dados = bodySimularRendaSchema.parse(corpoJson);

  return obterSimulacaoRenda(deps, {
    rendaHipoteticaCents: dados.rendaHipoteticaCents,
    numCiclos: dados.numCiclos ?? null,
  });
});
