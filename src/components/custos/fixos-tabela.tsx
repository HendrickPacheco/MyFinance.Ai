'use client';

import { Pencil, PauseCircle, PlayCircle, Trash2 } from 'lucide-react';
import {
  Badge,
  SortableTh,
  TBody,
  TFoot,
  THead,
  Table,
  Td,
  Th,
  Tr,
  type OrdemColuna,
} from '@/components/ui';
import { MenuAcoes, type AcaoMenu } from './menu-acoes';
import type { LinhaCustoFixoGestao } from '@/application/custos-view';
import { formatBRL, somaCents } from '@/shared/dinheiro';
import { formatarDataCurta } from '@/shared/data';

export type ColunaFixos = 'nome' | 'valor' | 'vencimento';
export interface OrdenacaoFixos {
  coluna: ColunaFixos;
  direcao: 'asc' | 'desc';
}

export interface AcoesLinhaFixo {
  onEditar: (linha: LinhaCustoFixoGestao) => void;
  onDesativar: (linha: LinhaCustoFixoGestao) => void;
  /** Volta a contar na verba. Só é oferecido nas linhas já desativadas. */
  onReativar: (linha: LinhaCustoFixoGestao) => void;
  /** Excluir de vez. Só é oferecido quando `ciclosComPagamento === 0`. */
  onExcluir: (linha: LinhaCustoFixoGestao) => void;
  /** Caminho bloqueado: abre o diálogo que explica por que não dá para excluir. */
  onExplicarBloqueio: (linha: LinhaCustoFixoGestao) => void;
}

export interface FixosTabelaProps extends AcoesLinhaFixo {
  linhas: readonly LinhaCustoFixoGestao[];
  ordenacao: OrdenacaoFixos;
  onOrdenar: (coluna: ColunaFixos) => void;
}

/** Ordem de exibição. Não é regra financeira — só apresentação. */
export function ordenarLinhas(
  linhas: readonly LinhaCustoFixoGestao[],
  { coluna, direcao }: OrdenacaoFixos,
): LinhaCustoFixoGestao[] {
  const sinal = direcao === 'asc' ? 1 : -1;
  return [...linhas].sort((a, b) => {
    if (coluna === 'valor') return sinal * (a.custo.valorCents - b.custo.valorCents);
    if (coluna === 'vencimento') return sinal * (a.custo.diaVencimento - b.custo.diaVencimento);
    return sinal * a.custo.nome.localeCompare(b.custo.nome, 'pt-BR');
  });
}

export function ordemDaColuna(ordenacao: OrdenacaoFixos, coluna: ColunaFixos): OrdemColuna {
  return ordenacao.coluna === coluna ? ordenacao.direcao : 'none';
}

/**
 * Rótulo de vigência. Vigência é HINT DE PROJEÇÃO FUTURA: ciclo já nascido
 * guarda o próprio `fixosCents` congelado e ignora estas datas.
 */
export function rotuloVigencia(vigenteDe: string | null, vigenteAte: string | null): string | null {
  if (vigenteDe && vigenteAte) {
    return `${formatarDataCurta(vigenteDe)} → ${formatarDataCurta(vigenteAte)}`;
  }
  if (vigenteAte) return `até ${formatarDataCurta(vigenteAte)}`;
  if (vigenteDe) return `a partir de ${formatarDataCurta(vigenteDe)}`;
  return null;
}

/**
 * Monta as ações do menu ⋯ de um custo fixo (§4.1). Desativar é a ação
 * PRIMÁRIA porque é reversível; excluir só aparece quando o banco aceitaria —
 * com `PagamentoFixo` registrado a FK é `Restrict` e a exclusão falharia 100%
 * das vezes. Oferecer na UI uma ação que o banco recusa é pior que não
 * oferecê-la, então ali o item vira "Por que não dá para excluir?".
 *
 * Desativar e reativar são MUTUAMENTE EXCLUSIVOS, pelo estado da linha: a
 * confirmação de desativar promete "dá para reativar quando quiser", e essa
 * promessa só é verdadeira porque o item existe aqui na linha desativada.
 */
export function acoesDoCusto(linha: LinhaCustoFixoGestao, acoes: AcoesLinhaFixo): AcaoMenu[] {
  const podeExcluir = linha.ciclosComPagamento === 0;
  return [
    {
      id: 'editar',
      label: 'Editar',
      icone: <Pencil size={16} aria-hidden />,
      onSelect: () => acoes.onEditar(linha),
    },
    linha.custo.ativo
      ? {
          id: 'desativar',
          label: 'Desativar',
          icone: <PauseCircle size={16} aria-hidden />,
          onSelect: () => acoes.onDesativar(linha),
        }
      : {
          id: 'reativar',
          label: 'Reativar',
          icone: <PlayCircle size={16} aria-hidden />,
          onSelect: () => acoes.onReativar(linha),
        },
    podeExcluir
      ? {
          id: 'excluir',
          label: 'Excluir definitivamente',
          icone: <Trash2 size={16} aria-hidden />,
          tone: 'negativo' as const,
          onSelect: () => acoes.onExcluir(linha),
        }
      : {
          id: 'bloqueio',
          label: 'Por que não dá para excluir?',
          icone: <Trash2 size={16} aria-hidden />,
          onSelect: () => acoes.onExplicarBloqueio(linha),
        },
  ];
}

/**
 * Lista de custos fixos no desktop. `<table>` semântica de propósito: a lista
 * tem ordenação por coluna e `aria-sort` só existe em `<th>`.
 */
export function FixosTabela({
  linhas,
  ordenacao,
  onOrdenar,
  ...acoes
}: FixosTabelaProps) {
  const totalCents = somaCents(linhas.filter((l) => l.custo.ativo).map((l) => l.custo.valorCents));

  return (
    <Table
      legenda={`Custos fixos, ${linhas.length} cadastrados, total ativo ${formatBRL(totalCents)} por mês`}
    >
      <THead>
        <tr>
          <SortableTh ordem={ordemDaColuna(ordenacao, 'nome')} onClick={() => onOrdenar('nome')}>
            Custo
          </SortableTh>
          <SortableTh
            numerico
            ordem={ordemDaColuna(ordenacao, 'vencimento')}
            onClick={() => onOrdenar('vencimento')}
          >
            Vence
          </SortableTh>
          <SortableTh
            numerico
            ordem={ordemDaColuna(ordenacao, 'valor')}
            onClick={() => onOrdenar('valor')}
          >
            Valor/mês
          </SortableTh>
          <Th className="w-14">
            <span className="sr-only">Ações</span>
          </Th>
        </tr>
      </THead>
      <TBody>
        {linhas.map((linha) => {
          const vigencia = rotuloVigencia(linha.custo.vigenteDe, linha.custo.vigenteAte);
          return (
            <Tr key={linha.custo.id}>
              <Td>
                <span className={linha.custo.ativo ? 'text-fg' : 'text-faint line-through'}>
                  {linha.custo.nome}
                </span>
                {!linha.custo.ativo ? (
                  <Badge tone="neutral" className="ml-2">
                    Desativado
                  </Badge>
                ) : null}
                {vigencia ? <p className="tnum text-xs text-faint">{vigencia}</p> : null}
              </Td>
              <Td numerico className="text-muted">
                dia {linha.custo.diaVencimento}
              </Td>
              <Td numerico className={linha.custo.ativo ? 'text-fg' : 'text-faint'}>
                {formatBRL(linha.custo.valorCents)}
              </Td>
              <Td className="text-right">
                <MenuAcoes
                  rotulo={`Ações de ${linha.custo.nome}`}
                  acoes={acoesDoCusto(linha, acoes)}
                />
              </Td>
            </Tr>
          );
        })}
      </TBody>
      <TFoot>
        <tr>
          <Td colSpan={2} className="text-xs uppercase tracking-wide">
            Total ativo
          </Td>
          <Td numerico className="text-fg">
            {formatBRL(totalCents)}
          </Td>
          <Td />
        </tr>
      </TFoot>
    </Table>
  );
}
