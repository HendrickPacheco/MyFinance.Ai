/**
 * Botão "Nova compra parcelada" do card `ParceladosLista` (Server Component).
 * Só dispara o evento de abertura do `ParcelamentoModal` — é client apenas
 * por causa do `onClick`, mesmo padrão de baixo acoplamento já usado entre a
 * sidebar e o `LancamentoPainel` (`EVENTO_ABRIR_LANCAMENTO`): zero prop
 * drilling entre um Server Component e o modal montado em `PainelDesktop`.
 */
'use client';

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui';
import { EVENTO_ABRIR_PARCELAMENTO } from './parcelamento-modal';
import { usePodeEscrever } from '@/components/auth/ator-contexto';

export function AbrirParcelamentoBotao() {
  const podeEscrever = usePodeEscrever();
  if (!podeEscrever) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR_PARCELAMENTO))}
    >
      <Plus size={16} aria-hidden="true" />
      Nova parcela
    </Button>
  );
}
