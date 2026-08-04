'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { z } from 'zod';
import { criarDeps } from '@/composition';
import { login as ucLogin, logout as ucLogout } from '@/application/auth';
import { executar, type Resultado } from './resultado';

const entrarSchema = z.object({
  email: z.string().trim().min(1).max(254).email(),
  // Teto alto para não recusar senha longa de gerenciador; teto EXISTE porque
  // Argon2id hasheia o que receber e um payload gigante viraria CPU nossa.
  senha: z.string().min(1).max(1024),
});

/** IP da requisição, só para compor a chave do rate limit de login. */
async function origemDaRequisicao(): Promise<string> {
  const h = await headers();
  const encaminhado = h.get('x-forwarded-for');
  return encaminhado?.split(',')[0]?.trim() || h.get('x-real-ip') || 'local';
}

export async function entrar(entrada: unknown): Promise<Resultado<{ papel: string }>> {
  return executar(async () => {
    const { email, senha } = entrarSchema.parse(entrada);
    const deps = await criarDeps();
    const ator = await ucLogin(deps, { email, senha, origem: await origemDaRequisicao() });
    return { papel: ator.papel };
  });
}

export async function sair(): Promise<void> {
  const deps = await criarDeps();
  await ucLogout(deps);
  redirect('/login');
}
