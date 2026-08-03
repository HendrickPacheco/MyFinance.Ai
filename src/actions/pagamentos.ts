'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { criarDeps } from '@/composition';
import { executar, type Resultado } from './resultado';
import {
  marcarCustoFixoPago as ucMarcarFixo,
  desmarcarCustoFixoPago as ucDesmarcarFixo,
  marcarParcelaPaga as ucMarcarParcela,
  desmarcarParcelaPaga as ucDesmarcarParcela,
} from '@/application/pagamentos';
import type { Transacao } from '@/domain/model/entidades';

const idNaoVazio = z.string().min(1, 'Id inválido.');

function revalidarPainel(): void {
  revalidatePath('/');
}

/**
 * Alterna o "Pago?" de um custo fixo NO CICLO ATUAL. RASTREAMENTO puro (ver
 * `src/application/pagamentos.ts`) — nunca recalcula verba, saldo ou teto.
 */
export async function marcarCustoFixoPago(
  custoFixoId: string,
  pago: boolean,
): Promise<Resultado<void>> {
  return executar(async () => {
    const id = idNaoVazio.parse(custoFixoId);
    const deps = await criarDeps();
    if (pago) {
      await ucMarcarFixo(deps, id);
    } else {
      await ucDesmarcarFixo(deps, id);
    }
    revalidarPainel();
  });
}

/**
 * Alterna o "Pago?" de uma parcela (Transacao). RASTREAMENTO puro — a parcela
 * já consome verba desde que foi lançada; isto só grava a data de pagamento.
 */
export async function marcarParcelaPaga(
  transacaoId: string,
  pago: boolean,
): Promise<Resultado<Transacao>> {
  return executar(async () => {
    const id = idNaoVazio.parse(transacaoId);
    const deps = await criarDeps();
    const transacao = pago ? await ucMarcarParcela(deps, id) : await ucDesmarcarParcela(deps, id);
    revalidarPainel();
    return transacao;
  });
}
