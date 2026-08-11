'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui';
import { MenuAcoes } from './menu-acoes';
import { CronogramaParcelas } from './cronograma-parcelas';
import { acoesDaCompra, type AcoesLinhaParcelamento } from './parcelados-tabela';
import type { LinhaParcelamentoGestao } from '@/application/parcelados-view';
import { formatBRL } from '@/shared/dinheiro';
import { formatarMesAno } from '@/shared/data';

export interface ParceladosListaMobileProps extends AcoesLinhaParcelamento {
  linhas: readonly LinhaParcelamentoGestao[];
  expandidos: ReadonlySet<string>;
  onAlternarExpansao: (id: string) => void;
}

/**
 * A mesma lista no mobile, como cards. Não é uma `<table>` aqui de propósito
 * (mesmo raciocínio de `fixos-lista-mobile`): sem largura para sete colunas,
 * a tabela rolaria horizontalmente e o leitor de tela anunciaria cabeçalhos
 * que ninguém consegue ver.
 *
 * A hierarquia sobrevive à perda das colunas: VALOR/MÊS continua sendo o
 * único número em `text-fg font-medium`, TERMINA vem logo abaixo dele, e
 * valor total + data da compra continuam em `text-faint`.
 */
export function ParceladosListaMobile({
  linhas,
  expandidos,
  onAlternarExpansao,
  ...acoes
}: ParceladosListaMobileProps) {
  return (
    <ul className="divide-y divide-border">
      {linhas.map((linha) => {
        const { resumo } = linha;
        const aberto = expandidos.has(resumo.id);
        const idPainel = `cronograma-mobile-${resumo.id}`;
        const encerrado = resumo.encerradoEm != null;

        return (
          <li key={resumo.id} className="py-2">
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                onClick={() => onAlternarExpansao(resumo.id)}
                aria-expanded={aberto}
                aria-controls={idPainel}
                className="flex min-h-[44px] min-w-0 flex-1 items-start gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {aberto ? (
                  <ChevronDown size={14} className="mt-1 shrink-0 text-faint" aria-hidden />
                ) : (
                  <ChevronRight size={14} className="mt-1 shrink-0 text-faint" aria-hidden />
                )}
                <span className="min-w-0">
                  <span className={encerrado ? 'text-faint line-through' : 'text-fg'}>
                    {resumo.descricao}
                  </span>
                  {encerrado ? (
                    <Badge tone="neutral" className="ml-2">
                      Encerrada
                    </Badge>
                  ) : null}
                  <span className="tnum block text-xs text-muted">
                    {resumo.parcelaCorrente ?? '—'}/{resumo.numParcelas} ·{' '}
                    {linha.categoriaNome ?? 'sem categoria'}
                  </span>
                  <span className="tnum block text-xs text-faint">
                    {formatarMesAno(resumo.dataCompra)} · {formatBRL(resumo.valorTotalCents)}
                  </span>
                </span>
              </button>

              <div className="flex shrink-0 items-start gap-2">
                <div className="text-right">
                  <p className={`tnum ${encerrado ? 'text-faint' : 'font-medium text-fg'}`}>
                    {formatBRL(resumo.valorMensalCents)}
                  </p>
                  <p className="tnum text-xs text-muted">
                    até {resumo.terminaEm ? formatarMesAno(resumo.terminaEm) : '—'}
                  </p>
                  {resumo.acabaNoProximoCiclo ? (
                    <p className="text-xs text-positivo">acaba no próximo ciclo</p>
                  ) : null}
                </div>
                <MenuAcoes
                  rotulo={`Ações de ${resumo.descricao}`}
                  acoes={acoesDaCompra(linha, acoes)}
                />
              </div>
            </div>

            {aberto ? (
              <div id={idPainel} className="mt-2 rounded-xl bg-surface-2/40 px-3">
                <CronogramaParcelas descricao={resumo.descricao} parcelas={resumo.parcelas} />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
