'use server';

/**
 * Server actions de GESTÃO de tokens da API do agente (feat/agent-api-v1,
 * tela `/config/tokens`). Só orquestram: validam com Zod, montam `Deps` via
 * sessão de cookie (`criarDeps()` — nunca o agente autenticado por token
 * pode criar/revogar a própria credencial) e chamam os casos de uso de
 * `src/application/api-tokens.ts`. Mesmo padrão de `src/actions/importacao.ts`:
 * nenhuma exceção vaza para a UI (SPEC 8).
 */
import { z } from 'zod';
import { criarDeps } from '@/composition';
import { executar, type Resultado } from './resultado';
import {
  calcularExpiraEmFimDoDia,
  criarToken,
  listarTokens,
  revogarToken,
  type ApiTokenResumo,
  type TokenCriado,
} from '@/application/api-tokens';

/** Mesmo fallback de `composition.ts` — Config sem timezone ainda não existe neste app. */
const TIMEZONE_PADRAO = 'America/Bahia';

const criarTokenSchema = z.object({
  nome: z.string().trim().min(1, 'Nome do token é obrigatório.'),
  escopos: z.array(z.enum(['read', 'write', 'admin'])).min(1, 'Escolha ao menos um escopo.'),
  /** "YYYY-MM-DD" vindo de `<input type="date">` — `null`/omitido = sem expiração. */
  expiraEmData: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de expiração precisa estar em YYYY-MM-DD.')
    .nullable()
    .optional(),
});

export async function criarTokenAction(entrada: unknown): Promise<Resultado<TokenCriado>> {
  return executar(async () => {
    const validado = criarTokenSchema.parse(entrada);
    const deps = await criarDeps();

    const timezone = (await deps.config.obter())?.timezone ?? TIMEZONE_PADRAO;
    const expiraEm = validado.expiraEmData
      ? calcularExpiraEmFimDoDia(validado.expiraEmData, timezone)
      : null;

    return criarToken(deps, { nome: validado.nome, escopos: validado.escopos, expiraEm });
  });
}

export async function listarTokensAction(): Promise<Resultado<ApiTokenResumo[]>> {
  return executar(async () => {
    const deps = await criarDeps();
    return listarTokens(deps);
  });
}

const revogarTokenSchema = z.object({ id: z.string().min(1) });

export async function revogarTokenAction(entrada: unknown): Promise<Resultado<void>> {
  return executar(async () => {
    const validado = revogarTokenSchema.parse(entrada);
    const deps = await criarDeps();
    await revogarToken(deps, validado.id);
  });
}
