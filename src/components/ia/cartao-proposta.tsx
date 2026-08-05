'use client';

/**
 * O cartão de confirmação de uma proposta do copiloto (decisão D-8).
 *
 * Este componente É a fronteira de segurança da escrita por IA. Tudo o que o
 * modelo preparou fica visível ANTES de existir no banco: o valor formatado, a
 * data, a categoria pelo nome. O botão é a única porta.
 *
 * Por isso três decisões de interface que não são estéticas:
 *
 *  1. O valor aparece formatado e por extenso na lista de detalhes, nunca só
 *     dentro da frase do modelo. A frase pode estar errada; o detalhe vem de
 *     `descreverProposta`, função pura sobre o dado que será gravado.
 *  2. O botão diz o que vai acontecer ("Lançar R$ 47,00"), não "OK". Ninguém
 *     confirma o que não consegue ler.
 *  3. Depois de confirmar, o cartão vira um estado terminal e não volta a ser
 *     clicável — duplo clique não lança duas vezes.
 */
import * as React from 'react';
import { Check, Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { confirmarProposta } from '@/actions/ia';
import type { PropostaExibivel } from '@/application/ia/propostas';

type Estado = 'PENDENTE' | 'ENVIANDO' | 'CONFIRMADA' | 'DESCARTADA' | 'ERRO';

export function CartaoProposta({ item }: { item: PropostaExibivel }) {
  const [estado, setEstado] = React.useState<Estado>('PENDENTE');
  const [erro, setErro] = React.useState<string | null>(null);

  const confirmar = React.useCallback(async () => {
    // Guarda contra duplo clique: a action é idempotente do lado do usuário
    // (ele vê um cartão), mas não do lado do banco — duas chamadas criariam
    // duas transações.
    if (estado !== 'PENDENTE') return;

    setEstado('ENVIANDO');
    const resultado = await confirmarProposta(item.proposta);

    if (resultado.ok) {
      setEstado('CONFIRMADA');
    } else {
      setEstado('ERRO');
      setErro(resultado.erro);
    }
  }, [estado, item.proposta]);

  if (estado === 'DESCARTADA') {
    return (
      <p className="text-xs text-muted">
        Proposta descartada — nada foi gravado.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-border-strong bg-surface-2 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-fg">{item.resumo}</p>
        {estado === 'CONFIRMADA' ? (
          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-positivo">
            <Check className="size-3.5" aria-hidden />
            Gravado
          </span>
        ) : (
          <span className="shrink-0 text-xs text-muted">Ainda não gravado</span>
        )}
      </div>

      <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        {item.detalhes.map((detalhe) => (
          <div key={detalhe.rotulo} className="flex justify-between gap-3 sm:block">
            <dt className="text-xs uppercase tracking-wide text-muted">{detalhe.rotulo}</dt>
            <dd className="tnum text-fg">{detalhe.valor}</dd>
          </div>
        ))}
      </dl>

      {erro ? (
        <p className="mt-3 text-sm text-negativo" role="alert">
          {erro}
        </p>
      ) : null}

      {estado === 'CONFIRMADA' ? null : (
        <div className="mt-3 flex gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => void confirmar()}
            disabled={estado === 'ENVIANDO'}
          >
            {estado === 'ENVIANDO' ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Plus className="size-4" aria-hidden />
            )}
            {/* O botão diz o que vai acontecer, não "OK". */}
            {estado === 'ERRO' ? 'Tentar de novo' : item.resumo}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setEstado('DESCARTADA')}
            disabled={estado === 'ENVIANDO'}
          >
            <X className="size-4" aria-hidden />
            Descartar
          </Button>
        </div>
      )}
    </div>
  );
}
