'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { criarDeps } from '@/composition';
import { cadastrar as ucCadastrar, TAMANHO_MINIMO_SENHA } from '@/application/cadastro';
import { codigoDeCadastro } from '@/infrastructure/auth/config-cadastro';
import { executar, type Resultado } from './resultado';

const cadastroSchema = z.object({
  email: z.string().trim().min(1).max(254).email(),
  // Teto alto para não recusar senha de gerenciador; teto EXISTE porque o
  // Argon2id hasheia o que receber e um payload gigante viraria CPU nossa.
  senha: z.string().min(TAMANHO_MINIMO_SENHA).max(1024),
  nome: z.string().trim().max(120).optional(),
  codigo: z.string().min(1).max(200),
});

async function origemDaRequisicao(): Promise<string> {
  const h = await headers();
  const encaminhado = h.get('x-forwarded-for');
  return encaminhado?.split(',')[0]?.trim() || h.get('x-real-ip') || 'local';
}

export async function cadastrar(entrada: unknown): Promise<Resultado<{ papel: string }>> {
  return executar(async () => {
    const dados = cadastroSchema.parse(entrada);
    const deps = await criarDeps();
    const ator = await ucCadastrar(
      deps,
      { ...dados, origem: await origemDaRequisicao() },
      // O código esperado é lido no SERVIDOR; nunca é enviado ao cliente.
      codigoDeCadastro(),
    );
    return { papel: ator.papel };
  });
}
