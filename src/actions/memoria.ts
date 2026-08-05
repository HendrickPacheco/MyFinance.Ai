'use server';

/**
 * Server actions da memória do copiloto (Fase E, tarefa E7).
 *
 * Só orquestram: validam a entrada, montam as dependências e chamam o caso de
 * uso. A autorização (OWNER-only, decisão D-12) e a guarda pura contra valor
 * monetário vivem em `application/memoria.ts` — checar aqui além disso seria
 * duplicar a regra em dois lugares que podem divergir.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { criarDeps } from '@/composition';
import { executar, type Resultado } from './resultado';
import {
  arquivarMemoria,
  listarMemorias,
  reativarMemoria,
  reindexarMemorias,
  salvarMemoria,
} from '@/application/memoria';
import { MAX_CARACTERES_MEMORIA, TIPOS_MEMORIA } from '@/domain/memoria/regras';
import type { Memoria } from '@/domain/ports/memoria';

const novaMemoriaSchema = z.object({
  tipo: z.enum(TIPOS_MEMORIA),
  texto: z.string().trim().min(1, 'Escreva a memória.').max(MAX_CARACTERES_MEMORIA),
});

export async function criarMemoriaManual(entrada: {
  tipo: string;
  texto: string;
}): Promise<Resultado<Memoria>> {
  return executar(async () => {
    const validado = novaMemoriaSchema.parse(entrada);
    const memoria = await salvarMemoria(await criarDeps(), {
      tipo: validado.tipo,
      texto: validado.texto,
      origem: 'USUARIO',
    });
    revalidatePath('/copiloto/memoria');
    return memoria;
  });
}

export async function listarMemoriasAction(opcoes?: {
  incluirArquivadas?: boolean;
}): Promise<Resultado<Memoria[]>> {
  return executar(async () =>
    listarMemorias(await criarDeps(), { incluirArquivadas: opcoes?.incluirArquivadas }),
  );
}

/**
 * Reindexa memórias sem vetor. O caso de uso principal é logo depois de
 * importar um backup, que não carrega os vetores (BACKUP_VERSION 3).
 */
export async function reindexarMemoriasAction(): Promise<
  Resultado<{ reindexadas: number; restantes: number }>
> {
  return executar(async () => {
    const resultado = await reindexarMemorias(await criarDeps());
    revalidatePath('/copiloto/memoria');
    return resultado;
  });
}

export async function arquivarMemoriaAction(id: string): Promise<Resultado<void>> {
  return executar(async () => {
    await arquivarMemoria(await criarDeps(), z.string().min(1).parse(id));
    revalidatePath('/copiloto/memoria');
  });
}

export async function reativarMemoriaAction(id: string): Promise<Resultado<void>> {
  return executar(async () => {
    await reativarMemoria(await criarDeps(), z.string().min(1).parse(id));
    revalidatePath('/copiloto/memoria');
  });
}
