'use client';

import { Pencil, PauseCircle, PlayCircle, Trash2 } from 'lucide-react';
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
import { MenuAcoes, type AcaoMenu } from './menu-acoes';
import type { ProvisaoAnual } from '@/domain/model/entidades';
import { formatBRL, somaCents } from '@/shared/dinheiro';
import { MESES_ABREVIADOS_PT_BR } from '@/shared/data';

export type ColunaProvisoes = 'nome' | 'anual' | 'acumulado';
export interface OrdenacaoProvisoes {
  coluna: ColunaProvisoes;
  direcao: 'asc' | 'desc';
}

export interface AcoesProvisao {
  onEditar: (p: ProvisaoAnual) => void;
  onDesativar: (p: ProvisaoAnual) => void;
  /** Volta a contar na verba. Só é oferecido nas linhas já desativadas. */
  onReativar: (p: ProvisaoAnual) => void;
  onExcluir: (p: ProvisaoAnual) => void;
  /** Bloqueada por acumulado > 0: apagar jogaria fora dinheiro já reservado. */
  onExplicarBloqueio: (p: ProvisaoAnual) => void;
}

/**
 * Mensal derivado do anual. `Math.floor` é a divisão monetária acordada do
 * projeto (resto na última parte) e é a MESMA conta que
 * `provisaoMensalCents` faz no motor — aqui é só rótulo de linha, o total do
 * ciclo continua vindo do read-model.
 */
export function mensalDaProvisao(p: ProvisaoAnual): number {
  return Math.floor(p.valorAnualCents / 12);
}

export function ordenarProvisoes(
  provisoes: readonly ProvisaoAnual[],
  { coluna, direcao }: OrdenacaoProvisoes,
): ProvisaoAnual[] {
  const sinal = direcao === 'asc' ? 1 : -1;
  return [...provisoes].sort((a, b) => {
    if (coluna === 'anual') return sinal * (a.valorAnualCents - b.valorAnualCents);
    if (coluna === 'acumulado') return sinal * (a.acumuladoCents - b.acumuladoCents);
    return sinal * a.nome.localeCompare(b.nome, 'pt-BR');
  });
}

function ordem(o: OrdenacaoProvisoes, coluna: ColunaProvisoes): OrdemColuna {
  return o.coluna === coluna ? o.direcao : 'none';
}

export function rotuloMesEsperado(mes: number | null): string {
  if (mes === null) return '—';
  return MESES_ABREVIADOS_PT_BR[mes - 1] ?? '—';
}

/**
 * Ações de uma provisão. Excluir só aparece com `acumuladoCents === 0`: com
 * acumulado, apagar jogaria fora dinheiro já reservado, então a UI oferece o
 * caminho reversível em vez de um botão que o caso de uso recusaria.
 *
 * Desativar e reativar são MUTUAMENTE EXCLUSIVOS, pelo estado da linha — é o
 * que sustenta a promessa "dá para reativar quando quiser" da confirmação de
 * desativar.
 */
export function acoesDaProvisao(p: ProvisaoAnual, acoes: AcoesProvisao): AcaoMenu[] {
  return [
    {
      id: 'editar',
      label: 'Editar',
      icone: <Pencil size={16} aria-hidden />,
      onSelect: () => acoes.onEditar(p),
    },
    p.ativo
      ? {
          id: 'desativar',
          label: 'Desativar',
          icone: <PauseCircle size={16} aria-hidden />,
          onSelect: () => acoes.onDesativar(p),
        }
      : {
          id: 'reativar',
          label: 'Reativar',
          icone: <PlayCircle size={16} aria-hidden />,
          onSelect: () => acoes.onReativar(p),
        },
    p.acumuladoCents === 0
      ? {
          id: 'excluir',
          label: 'Excluir definitivamente',
          icone: <Trash2 size={16} aria-hidden />,
          tone: 'negativo' as const,
          onSelect: () => acoes.onExcluir(p),
        }
      : {
          id: 'bloqueio',
          label: 'Por que não dá para excluir?',
          icone: <Trash2 size={16} aria-hidden />,
          onSelect: () => acoes.onExplicarBloqueio(p),
        },
  ];
}

export function ProvisoesTabela({
  provisoes,
  ordenacao,
  onOrdenar,
  ...acoes
}: AcoesProvisao & {
  provisoes: readonly ProvisaoAnual[];
  ordenacao: OrdenacaoProvisoes;
  onOrdenar: (c: ColunaProvisoes) => void;
}) {
  const mensalTotal = somaCents(
    provisoes.filter((p) => p.ativo).map((p) => mensalDaProvisao(p)),
  );

  return (
    <Table
      legenda={`Provisões anuais, ${provisoes.length} cadastradas, total ativo ${formatBRL(mensalTotal)} por mês`}
    >
      <THead>
        <tr>
          <SortableTh ordem={ordem(ordenacao, 'nome')} onClick={() => onOrdenar('nome')}>
            Provisão
          </SortableTh>
          <Th>Mês</Th>
          <SortableTh numerico ordem={ordem(ordenacao, 'anual')} onClick={() => onOrdenar('anual')}>
            Valor/ano
          </SortableTh>
          <SortableTh
            numerico
            ordem={ordem(ordenacao, 'acumulado')}
            onClick={() => onOrdenar('acumulado')}
          >
            Acumulado
          </SortableTh>
          <Th numerico>Por mês</Th>
          <Th className="w-14">
            <span className="sr-only">Ações</span>
          </Th>
        </tr>
      </THead>
      <TBody>
        {provisoes.map((p) => (
          <Tr key={p.id}>
            <Td>
              <span className={p.ativo ? 'text-fg' : 'text-faint line-through'}>{p.nome}</span>
              {!p.ativo ? (
                <Badge tone="neutral" className="ml-2">
                  Desativada
                </Badge>
              ) : null}
            </Td>
            <Td className="text-muted">{rotuloMesEsperado(p.mesEsperado)}</Td>
            <Td numerico className="text-muted">
              {formatBRL(p.valorAnualCents)}
            </Td>
            <Td numerico className={p.acumuladoCents > 0 ? 'text-positivo' : 'text-faint'}>
              {formatBRL(p.acumuladoCents)}
            </Td>
            <Td numerico className={p.ativo ? 'text-fg' : 'text-faint'}>
              {formatBRL(mensalDaProvisao(p))}
            </Td>
            <Td className="text-right">
              <MenuAcoes rotulo={`Ações de ${p.nome}`} acoes={acoesDaProvisao(p, acoes)} />
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}

/** A mesma lista no mobile — mesmas ações, vindas de `acoesDaProvisao`. */
export function ProvisoesListaMobile({
  provisoes,
  ...acoes
}: AcoesProvisao & { provisoes: readonly ProvisaoAnual[] }) {
  return (
    <ul className="divide-y divide-border">
      {provisoes.map((p) => (
        <li key={p.id} className="flex items-center justify-between gap-3 py-2">
          <div className="min-w-0">
            <p className={p.ativo ? 'text-fg' : 'text-faint line-through'}>
              {p.nome}
              {!p.ativo ? (
                <Badge tone="neutral" className="ml-2">
                  Desativada
                </Badge>
              ) : null}
            </p>
            <p className="tnum text-xs text-faint">
              {formatBRL(p.valorAnualCents)}/ano · acumulado {formatBRL(p.acumuladoCents)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="tnum text-sm text-muted">{formatBRL(mensalDaProvisao(p))}/mês</span>
            <MenuAcoes rotulo={`Ações de ${p.nome}`} acoes={acoesDaProvisao(p, acoes)} />
          </div>
        </li>
      ))}
    </ul>
  );
}
