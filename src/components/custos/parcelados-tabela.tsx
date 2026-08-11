'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight, Pencil, XCircle } from 'lucide-react';
import {
  Badge,
  SortableTh,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
  type OrdemColuna,
} from '@/components/ui';
import type { ColunaParcelados, OrdenacaoParcelados } from './ordenacao-parcelados';
import { MenuAcoes, type AcaoMenu } from './menu-acoes';
import { CronogramaParcelas } from './cronograma-parcelas';
import type { LinhaParcelamentoGestao } from '@/application/parcelados-view';
import { formatBRL, somaCents } from '@/shared/dinheiro';
import { formatarDataCurta, formatarMesAno } from '@/shared/data';
import { cn } from '@/lib/cn';

// A ordenação vive em módulo sem JSX para poder ser testada no ambiente
// `node` do Vitest; reexportada aqui para os consumidores importarem de um
// lugar só.
export {
  ORDENACAO_PADRAO,
  ordenarParcelamentos,
  type ColunaParcelados,
  type OrdenacaoParcelados,
} from './ordenacao-parcelados';

export interface AcoesLinhaParcelamento {
  onEditar: (linha: LinhaParcelamentoGestao) => void;
  onEncerrar: (linha: LinhaParcelamentoGestao) => void;
}

export interface ParceladosTabelaProps extends AcoesLinhaParcelamento {
  linhas: readonly LinhaParcelamentoGestao[];
  ordenacao: OrdenacaoParcelados;
  onOrdenar: (coluna: ColunaParcelados) => void;
  expandidos: ReadonlySet<string>;
  onAlternarExpansao: (id: string) => void;
}

export function ordemDaColuna(
  ordenacao: OrdenacaoParcelados,
  coluna: ColunaParcelados,
): OrdemColuna {
  return ordenacao.coluna === coluna ? ordenacao.direcao : 'none';
}

/**
 * Ações do menu ⋯ de uma compra. Compartilhado entre a tabela e os cards do
 * mobile pelo mesmo motivo de `acoesDoCusto` (Fase 7): as duas superfícies
 * nunca podem divergir sobre o que uma ação faz.
 *
 * "Encerrar" some quando não há o que cancelar — compra já encerrada, ou toda
 * paga/vencida. Oferecer um botão que abriria um diálogo dizendo "0 parcelas
 * serão canceladas" é a mesma promessa vazia que o §4.1 legisla contra.
 */
export function acoesDaCompra(
  linha: LinhaParcelamentoGestao,
  acoes: AcoesLinhaParcelamento,
): AcaoMenu[] {
  const itens: AcaoMenu[] = [
    {
      id: 'editar',
      label: 'Editar',
      icone: <Pencil size={16} aria-hidden />,
      onSelect: () => acoes.onEditar(linha),
    },
  ];
  if (linha.resumo.encerradoEm == null) {
    itens.push({
      id: 'encerrar',
      label: 'Cancelar parcelas futuras…',
      icone: <XCircle size={16} aria-hidden />,
      tone: 'negativo',
      onSelect: () => acoes.onEncerrar(linha),
    });
  }
  return itens;
}

/**
 * Barra de progresso da compra. `role="img"` com `aria-label` textual: sem
 * isso o leitor de tela anunciaria dois divs vazios. O número k/N fica ao
 * lado em texto — a barra é reforço, nunca o único portador do significado
 * (SPEC 11).
 *
 * O numerador é `parcelaCorrente`, o MESMO do rótulo k/N logo acima — não
 * `parcelasPagas`. A revisão no navegador pegou as duas noções empilhadas: o
 * texto dizia "1/2" e a barra desenhava 0/2, porque `pagoEm` é marcação
 * manual do `PagamentoToggle` e o dono quase nunca marca. Barra sempre vazia
 * embaixo de um "1/2" lê-se como erro do número, não como "nada foi marcado".
 */
function BarraProgresso({ corrente, total }: { corrente: number | null; total: number }) {
  const decorridas = corrente ?? 0;
  const proporcao = total > 0 ? Math.min(Math.max(decorridas / total, 0), 1) : 0;
  return (
    <div
      role="img"
      aria-label={`parcela ${decorridas} de ${total}`}
      className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-2"
    >
      <div className="h-full rounded-full bg-accent" style={{ width: `${proporcao * 100}%` }} />
    </div>
  );
}

/**
 * Lista de compras parceladas no desktop. `<table>` semântica pelo mesmo
 * motivo da Fase 7: a lista tem ordenação por coluna e `aria-sort` só existe
 * em `<th>`.
 *
 * O OBJETO DA LINHA É A COMPRA, não a parcela (§3.2) — a parcela aparece só
 * quando a linha é expandida. Valor total e data da compra descem para a
 * segunda linha em `text-faint`: são contexto histórico, não decisão. Só
 * VALOR/MÊS ganha `text-fg font-medium`, porque é o número que consome o teto.
 */
export function ParceladosTabela({
  linhas,
  ordenacao,
  onOrdenar,
  expandidos,
  onAlternarExpansao,
  ...acoes
}: ParceladosTabelaProps) {
  const totalMensalCents = somaCents(
    linhas.filter((l) => l.resumo.encerradoEm == null).map((l) => l.resumo.valorMensalCents),
  );

  return (
    <Table
      legenda={`Compras parceladas, ${linhas.length} listadas, ${formatBRL(totalMensalCents)} por mês em andamento`}
    >
      <THead>
        <tr>
          <SortableTh
            ordem={ordemDaColuna(ordenacao, 'compra')}
            onClick={() => onOrdenar('compra')}
          >
            Compra
          </SortableTh>
          <Th>Categoria</Th>
          <Th numerico>Parcela</Th>
          <SortableTh
            numerico
            ordem={ordemDaColuna(ordenacao, 'valorMensal')}
            onClick={() => onOrdenar('valorMensal')}
          >
            Valor/mês
          </SortableTh>
          <SortableTh
            numerico
            ordem={ordemDaColuna(ordenacao, 'resta')}
            onClick={() => onOrdenar('resta')}
          >
            Resta
          </SortableTh>
          <SortableTh
            numerico
            ordem={ordemDaColuna(ordenacao, 'termina')}
            onClick={() => onOrdenar('termina')}
          >
            Termina
          </SortableTh>
          <Th className="w-14">
            <span className="sr-only">Ações</span>
          </Th>
        </tr>
      </THead>
      <TBody>
        {linhas.map((linha) => {
          const { resumo } = linha;
          const aberto = expandidos.has(resumo.id);
          const idPainel = `cronograma-${resumo.id}`;
          const encerrado = resumo.encerradoEm != null;

          return (
            <React.Fragment key={resumo.id}>
              <Tr>
                <Td>
                  <button
                    type="button"
                    onClick={() => onAlternarExpansao(resumo.id)}
                    aria-expanded={aberto}
                    aria-controls={idPainel}
                    className="flex min-h-[44px] items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
                  >
                    {aberto ? (
                      <ChevronDown size={14} className="shrink-0 text-faint" aria-hidden />
                    ) : (
                      <ChevronRight size={14} className="shrink-0 text-faint" aria-hidden />
                    )}
                    <span>
                      <span className={encerrado ? 'text-faint line-through' : 'text-fg'}>
                        {resumo.descricao}
                      </span>
                      {encerrado ? (
                        <Badge tone="neutral" className="ml-2">
                          Encerrada
                        </Badge>
                      ) : null}
                      <span className="tnum block text-xs text-faint">
                        {formatarMesAno(resumo.dataCompra)} · {formatBRL(resumo.valorTotalCents)}
                      </span>
                    </span>
                  </button>
                </Td>
                <Td className="text-muted">{linha.categoriaNome ?? 'sem categoria'}</Td>
                <Td numerico className="text-muted">
                  <span>
                    {resumo.parcelaCorrente ?? '—'}/{resumo.numParcelas}
                  </span>
                  <BarraProgresso corrente={resumo.parcelaCorrente} total={resumo.numParcelas} />
                </Td>
                <Td numerico className={encerrado ? 'text-faint' : 'text-fg font-medium'}>
                  {formatBRL(resumo.valorMensalCents)}
                </Td>
                <Td numerico className="text-muted">
                  {formatBRL(resumo.valorRestanteCents)}
                </Td>
                <Td numerico className="text-muted">
                  {resumo.terminaEm ? formatarMesAno(resumo.terminaEm) : '—'}
                  {resumo.acabaNoProximoCiclo ? (
                    <span className="block text-xs text-positivo">acaba no próximo ciclo</span>
                  ) : null}
                </Td>
                <Td className="text-right">
                  <MenuAcoes
                    rotulo={`Ações de ${resumo.descricao}`}
                    acoes={acoesDaCompra(linha, acoes)}
                  />
                </Td>
              </Tr>
              {aberto ? (
                <tr id={idPainel}>
                  <td colSpan={7} className={cn('bg-surface-2/40 px-3 pb-3')}>
                    <p className="pt-2 text-xs uppercase tracking-wide text-faint">
                      Cronograma · compra em {formatarDataCurta(resumo.dataCompra)}
                    </p>
                    <CronogramaParcelas
                      descricao={resumo.descricao}
                      parcelas={resumo.parcelas}
                    />
                  </td>
                </tr>
              ) : null}
            </React.Fragment>
          );
        })}
      </TBody>
    </Table>
  );
}
