'use client';

/**
 * Extrato de gastos variáveis, linha a linha, com edição e exclusão inline.
 *
 * DUAS superfícies, UM componente (TASKS-CUSTOS §3.1). A prop `escopo` só
 * muda a COPY — nunca a regra:
 *
 *  - `ciclo`   → painel desktop (`/`), gastos do ciclo em andamento.
 *  - `periodo` → `/custos/variaveis`, recorte multi-ciclo com filtros.
 *
 * O que ele lista é decidido no servidor por `extratoTransacoesVariaveis`
 * (`domain/finance/agregacoes.ts`), que aplica `contaComoVerbaVariavel` de
 * `teto.ts`: só grupo VARIAVEL, sem `provisaoId` e sem `parcelamentoId`.
 * Gasto de provisão e parcela NÃO consomem verba variável (regra 5 / D-11),
 * então não podem aparecer aqui somados a quem consome — é a regra R4 do
 * plano, e ela mora no motor, não neste arquivo.
 *
 * `transacoes` já vem ordenada (mais recentes primeiro) e os totais já vêm
 * somados pelo read-model — este componente NUNCA faz aritmética monetária,
 * só formata (regra 1/11).
 *
 * ESTORNO abate a verba em vez de consumi-la: por isso cada linha de estorno
 * ganha um selo "estorno" e cor neutra (nunca a cor de despesa), para o
 * usuário não ler o extrato como se tudo ali fosse gasto.
 *
 * Mesma lógica para competência FUTURA (`ehProgramado`): a linha aparece — antes
 * sumia do painel inteiro — mas com selo "programado" e cor neutra, e o valor
 * entra numa linha SEPARADA do rodapé, nunca somado ao realizado.
 *
 * Editar/excluir reaproveitam as server actions de `@/actions/transacoes` e o
 * fluxo de confirmação retroativa compartilhado (`transacao-edicao-form`,
 * `use-exclusao-transacao`) — nunca um caminho de escrita próprio.
 */
import { useCallback, useState, type ReactNode } from 'react';
import { Pencil, Trash2, RotateCcw } from 'lucide-react';
import { formatarDataCurta } from '@/shared/data';
import { formatBRL } from '@/shared/dinheiro';
import { cn } from '@/lib/cn';
import { Card, CardHeader, CardTitle, CardContent, EmptyState } from '@/components/ui';
import { LABEL_METODO } from '@/components/dashboard/cores';
import type { LinhaTransacaoVariavel, OpcaoCategoria } from '@/application/dashboard-tipos';
import { usePodeEscrever } from '@/components/auth/ator-contexto';
import { TransacaoEdicaoForm } from './transacao-edicao-form';
import { useExclusaoTransacao } from './use-exclusao-transacao';

/** Onde o extrato está sendo mostrado. Muda a copy, nunca o que é listado. */
export type EscopoExtrato = 'ciclo' | 'periodo';

interface CopyEscopo {
  titulo: string;
  totalLabel: string;
  programadoLabel: string;
  vazioTitulo: string;
  vazioDescricao: string;
  /** Nota sob o cabeçalho explicando o que o extrato NÃO inclui (R4). */
  nota: string | null;
}

const COPY: Record<EscopoExtrato, CopyEscopo> = {
  ciclo: {
    titulo: 'Extrato de gastos variáveis',
    totalLabel: 'Realizado até hoje',
    programadoLabel: 'Programado até o fim do ciclo',
    vazioTitulo: 'Nenhum gasto variável lançado neste ciclo ainda',
    vazioDescricao:
      'É aqui que aparecem, dia a dia, os gastos que consomem sua verba variável — mercado, lazer, transporte. Clique em "Lançar gasto" na barra lateral (ou pressione N) para começar o extrato.',
    nota: null,
  },
  periodo: {
    titulo: 'Gastos variáveis no período',
    totalLabel: 'Total realizado no recorte',
    programadoLabel: 'Programado (competência futura)',
    vazioTitulo: 'Nenhum gasto variável neste recorte',
    vazioDescricao:
      'Nenhum gasto do grupo Variável caiu neste período com os filtros escolhidos. Amplie o período ou limpe os filtros de categoria e método.',
    nota: 'Só o que consome verba variável. Parcelas de compra parcelada e gastos de provisão anual ficam de fora — eles têm bolso próprio e não entram neste total.',
  },
};

const CLASSES_GRID = 'grid grid-cols-[3rem_1fr_9rem_6rem_7rem_5.5rem] gap-3';

function LinhaExtratoVariavel({
  transacao,
  categorias,
}: {
  transacao: LinhaTransacaoVariavel;
  categorias: readonly OpcaoCategoria[];
}) {
  // UX: VIEWER lê o extrato, mas não vê editar/excluir. A trava real é
  // `exigirEscrita` no caso de uso (TASKS-AUTH §2.3).
  const podeEscrever = usePodeEscrever();
  const [editando, setEditando] = useState(false);
  const exclusao = useExclusaoTransacao(transacao.transacaoId);

  const fecharEdicao = useCallback(() => setEditando(false), []);
  const descricaoExibida = transacao.descricao ?? transacao.categoriaNome ?? '—';

  if (editando) {
    return (
      <TransacaoEdicaoForm
        transacaoId={transacao.transacaoId}
        valorCents={transacao.valorCents}
        data={transacao.data}
        categoriaId={transacao.categoriaId}
        descricao={transacao.descricao}
        categorias={categorias}
        onCancelar={fecharEdicao}
        onSalvo={fecharEdicao}
      />
    );
  }

  return (
    <>
      <li className={cn(CLASSES_GRID, 'items-center py-2.5')}>
        <div className="text-xs text-faint">{formatarDataCurta(transacao.data)}</div>

        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate text-sm text-fg">
            <span className="truncate">{descricaoExibida}</span>
            {transacao.ehProgramado ? (
              <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                programado
              </span>
            ) : null}
          </p>
          {exclusao.erro ? <p className="mt-1 text-xs text-negativo">{exclusao.erro}</p> : null}
        </div>

        <div className="truncate text-xs text-muted">{transacao.categoriaNome ?? '—'}</div>

        <div className="truncate text-xs text-muted">
          {transacao.metodo ? LABEL_METODO[transacao.metodo] : '—'}
        </div>

        <div className="flex justify-end">
          {transacao.ehEstorno ? (
            <span className="tnum inline-flex items-center gap-1 text-sm font-medium text-muted">
              <RotateCcw size={13} aria-hidden />
              {formatBRL(transacao.valorCents)}
              <span className="sr-only">(estorno, abate da verba)</span>
            </span>
          ) : (
            // Programado nunca usa a cor de despesa: o dinheiro ainda não saiu
            // e ainda não consome o teto do dia.
            <span
              className={cn(
                'tnum text-sm font-medium',
                transacao.ehProgramado ? 'text-muted' : 'text-negativo',
              )}
            >
              -{formatBRL(transacao.valorCents)}
              {transacao.ehProgramado ? (
                <span className="sr-only">(programado, ainda não consome a verba)</span>
              ) : null}
            </span>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-1">
          {podeEscrever ? (
          <>
          <button
            type="button"
            onClick={() => setEditando(true)}
            disabled={exclusao.pendente}
            aria-label="Editar transação"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-50"
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            onClick={exclusao.pedirExclusao}
            disabled={exclusao.pendente}
            aria-label="Excluir transação"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-negativo disabled:opacity-50"
          >
            <Trash2 size={15} />
          </button>
          </>
          ) : null}
        </div>
      </li>
      {exclusao.confirmacao ? <li className="py-3">{exclusao.confirmacao}</li> : null}
    </>
  );
}

export interface ExtratoVariaveisProps {
  escopo: EscopoExtrato;
  transacoes: readonly LinhaTransacaoVariavel[];
  /** Soma líquida do que JÁ foi realizado no recorte. Vem pronta do read-model. */
  totalCents: number;
  /** Soma líquida só das linhas de competência futura. Nunca somada ao total. */
  programadasCents: number;
  categoriasLancamento: readonly OpcaoCategoria[];
  /** Filtros/ações do escopo `periodo`, renderizados no cabeçalho do card. */
  acoes?: ReactNode;
}

export function ExtratoVariaveis({
  escopo,
  transacoes,
  totalCents,
  programadasCents,
  categoriasLancamento,
  acoes,
}: ExtratoVariaveisProps) {
  const copy = COPY[escopo];
  const categoriasVariaveis = categoriasLancamento.filter((c) => c.grupo === 'VARIAVEL');

  return (
    <Card>
      <CardHeader
        className={acoes ? 'flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between' : undefined}
      >
        <CardTitle>{copy.titulo}</CardTitle>
        {acoes}
      </CardHeader>
      <CardContent>
        {copy.nota ? <p className="mb-3 text-xs text-faint">{copy.nota}</p> : null}

        {transacoes.length === 0 ? (
          <EmptyState titulo={copy.vazioTitulo} descricao={copy.vazioDescricao} />
        ) : (
          <>
            {/* O grid tem 5 colunas de largura FIXA (30,5rem + gaps) e só cabe
                a partir de ~38rem. Até a Fase 9 isso não aparecia: a home monta
                este extrato dentro de um `hidden lg:block`, então ele nunca
                renderizava abaixo de 1024px. `/custos/variaveis` o renderiza em
                qualquer largura — e a seção está a um toque na barra inferior do
                celular desde a Fase 7. Sem este contêiner, quem estoura é o
                BODY da página, e o valor fica cortado fora da tela.
                O scroll fica preso aqui dentro; o grid segue intocado, como
                manda o §5 do plano ("mexer nele é risco sem retorno"). */}
            <div className="-mx-1 overflow-x-auto px-1">
              <div className="min-w-[38rem]">
                <div
                  className={cn(
                    CLASSES_GRID,
                    'border-b border-border pb-2 text-xs uppercase tracking-wide text-faint',
                  )}
                >
                  <span>Data</span>
                  <span>Descrição</span>
                  <span>Categoria</span>
                  <span>Método</span>
                  <span className="text-right">Valor</span>
                  <span className="text-right">Ações</span>
                </div>
                <ul className="divide-y divide-border">
                  {transacoes.map((t) => (
                    <LinhaExtratoVariavel
                      key={t.transacaoId}
                      transacao={t}
                      categorias={categoriasVariaveis}
                    />
                  ))}
                </ul>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
              <span className="text-sm font-medium text-fg">{copy.totalLabel}</span>
              <span className="tnum text-lg font-semibold text-fg">{formatBRL(totalCents)}</span>
            </div>
            {/* Linha SEPARADA de propósito: programado ainda não consome verba,
                então nunca é somado ao realizado num número só. */}
            {programadasCents !== 0 ? (
              <div className="mt-1 flex items-center justify-between">
                <span className="text-sm text-muted">{copy.programadoLabel}</span>
                <span className="tnum text-sm font-medium text-muted">
                  {formatBRL(programadasCents)}
                </span>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
