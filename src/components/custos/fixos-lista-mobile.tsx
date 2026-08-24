'use client';

import { Badge } from '@/components/ui';
import { MenuAcoes } from './menu-acoes';
import { acoesDoCusto, legendaDoCusto, type AcoesLinhaFixo } from './fixos-tabela';
import type { LinhaCustoFixoGestao } from '@/application/custos-view';
import { formatBRL } from '@/shared/dinheiro';

export interface FixosListaMobileProps extends AcoesLinhaFixo {
  linhas: readonly LinhaCustoFixoGestao[];
}

/**
 * A mesma lista no mobile, como cards. Não é uma tabela aqui de propósito:
 * sem largura para colunas, uma `<table>` rolaria horizontalmente e o leitor
 * de tela anunciaria cabeçalhos que ninguém consegue ver. As AÇÕES e as regras
 * de exclusão são exatamente as mesmas — vêm de `acoesDoCusto`, compartilhado
 * com a tabela, para as duas superfícies nunca divergirem.
 */
export function FixosListaMobile({ linhas, ...acoes }: FixosListaMobileProps) {
  return (
    <ul className="divide-y divide-border">
      {linhas.map((linha) => {
        const legenda = legendaDoCusto(linha);
        return (
          <li key={linha.custo.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className={linha.custo.ativo ? 'text-fg' : 'text-faint line-through'}>
                {linha.custo.nome}
                {!linha.custo.ativo ? (
                  <Badge tone="neutral" className="ml-2">
                    Desativado
                  </Badge>
                ) : null}
              </p>
              <p className="tnum text-xs text-faint">
                vence dia {linha.custo.diaVencimento}
                {legenda ? ` · ${legenda}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="tnum text-sm text-muted">{formatBRL(linha.custo.valorCents)}</span>
              <MenuAcoes
                rotulo={`Ações de ${linha.custo.nome}`}
                acoes={acoesDoCusto(linha, acoes)}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
