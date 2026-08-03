'use client';

/**
 * Extrato de gastos variáveis do ciclo, dentro do painel desktop (SPEC 7.1 /
 * 11). É o único lugar do dashboard que mostra linha a linha o dinheiro que
 * consome verba de forma discricionária — categorias/métodos agregados
 * (`CategoriasPizza`, `MetodosPagamento`) não substituem essa leitura.
 *
 * `transacoes` já vem ordenada (mais recentes primeiro) e
 * `transacoesVariaveisTotalCents` já vem somado pelo read-model — este
 * componente NUNCA faz aritmética monetária, só formata (regra 1/11).
 *
 * ESTORNO abate a verba em vez de consumi-la: por isso cada linha de estorno
 * ganha um selo "estorno" e cor neutra (nunca a cor de despesa), para o
 * usuário não ler o extrato como se tudo ali fosse gasto.
 *
 * Editar/excluir reaproveitam as server actions de `@/actions/transacoes` e
 * o mesmo fluxo de confirmação retroativa de `src/components/ciclo/transacao-linha.tsx`
 * (transação tocando ciclo já fechado -> `requerConfirmacao` -> reenviar com
 * `confirmarRetroativo: true`).
 */
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2, RotateCcw } from 'lucide-react';
import { formatBRL, parseBRL } from '@/shared/dinheiro';
import { cn } from '@/lib/cn';
import { Button, Card, CardHeader, CardTitle, CardContent, ConfirmInline, EmptyState, Input, Label, Select } from '@/components/ui';
import { editarTransacao, excluirTransacao } from '@/actions/transacoes';
import { LABEL_METODO } from './cores';
import type { LinhaTransacaoVariavel, OpcaoCategoria } from '@/application/dashboard-tipos';

function formatarDataCurta(data: string): string {
  const [, mes, dia] = data.split('-');
  return `${dia}/${mes}`;
}

const TITULO_RETROATIVO = 'Esta transação pertence a um ciclo já fechado.';

function descricaoRetroativo(ciclosAfetados: string[] | undefined): string {
  const base = 'Confirmar vai recalcular a sobra daquele ciclo.';
  if (!ciclosAfetados || ciclosAfetados.length === 0) return base;
  const lista = ciclosAfetados.join(', ');
  return ciclosAfetados.length > 1
    ? `Confirmar vai recalcular a sobra dos ciclos: ${lista}.`
    : `Confirmar vai recalcular a sobra do ciclo ${lista}.`;
}

type Confirmacao =
  | { acao: 'excluir-destrutivo' }
  | { acao: 'excluir-retroativo'; ciclosAfetados?: string[] }
  | { acao: 'editar-retroativo'; valorCents: number; ciclosAfetados?: string[] };

function LinhaExtratoVariavel({
  transacao,
  categorias,
}: {
  transacao: LinhaTransacaoVariavel;
  categorias: OpcaoCategoria[];
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [pendente, setPendente] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null);

  const [valorTexto, setValorTexto] = useState(() => formatBRL(transacao.valorCents));
  const [categoriaId, setCategoriaId] = useState(transacao.categoriaId ?? '');
  const [descricao, setDescricao] = useState(transacao.descricao ?? '');
  const [data, setData] = useState(transacao.data);

  const descricaoExibida = transacao.descricao ?? transacao.categoriaNome ?? '—';

  const executarExclusao = useCallback(
    async (confirmarRetroativo: boolean) => {
      setPendente(true);
      setErro(null);
      const r = await excluirTransacao(transacao.transacaoId, confirmarRetroativo);
      setPendente(false);
      if (r.ok) {
        setConfirmacao(null);
        router.refresh();
        return;
      }
      if (r.requerConfirmacao && !confirmarRetroativo) {
        setConfirmacao({ acao: 'excluir-retroativo', ciclosAfetados: r.ciclosAfetados });
        return;
      }
      setConfirmacao(null);
      setErro(r.erro);
    },
    [transacao.transacaoId, router],
  );

  const excluir = useCallback(() => setConfirmacao({ acao: 'excluir-destrutivo' }), []);

  const abrirEdicao = useCallback(() => {
    setErro(null);
    setEditando(true);
  }, []);

  const executarEdicao = useCallback(
    async (valorCents: number, confirmarRetroativo: boolean) => {
      setPendente(true);
      setErro(null);
      const r = await editarTransacao(transacao.transacaoId, {
        valorCents,
        categoriaId: categoriaId || null,
        descricao: descricao || null,
        data,
        confirmarRetroativo,
      });
      setPendente(false);
      if (r.ok) {
        setConfirmacao(null);
        setEditando(false);
        router.refresh();
        return;
      }
      if (r.requerConfirmacao && !confirmarRetroativo) {
        setConfirmacao({ acao: 'editar-retroativo', valorCents, ciclosAfetados: r.ciclosAfetados });
        return;
      }
      setConfirmacao(null);
      setErro(r.erro);
    },
    [transacao.transacaoId, categoriaId, descricao, data, router],
  );

  const salvarEdicao = useCallback(() => {
    let valorCents: number;
    try {
      valorCents = parseBRL(valorTexto);
    } catch {
      setErro('Valor inválido.');
      return;
    }
    if (valorCents <= 0) {
      setErro('Informe um valor maior que zero.');
      return;
    }
    void executarEdicao(valorCents, false);
  }, [valorTexto, executarEdicao]);

  const cancelarConfirmacao = useCallback(() => setConfirmacao(null), []);

  const confirmarAcaoPendente = useCallback(() => {
    if (!confirmacao) return;
    switch (confirmacao.acao) {
      case 'excluir-destrutivo':
        void executarExclusao(false);
        return;
      case 'excluir-retroativo':
        void executarExclusao(true);
        return;
      case 'editar-retroativo':
        void executarEdicao(confirmacao.valorCents, true);
        return;
    }
  }, [confirmacao, executarExclusao, executarEdicao]);

  if (editando) {
    return (
      <li className="rounded-xl border border-border-strong bg-surface-2 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor={`valor-${transacao.transacaoId}`}>Valor</Label>
            <Input
              id={`valor-${transacao.transacaoId}`}
              inputMode="decimal"
              value={valorTexto}
              onChange={(e) => setValorTexto(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor={`data-${transacao.transacaoId}`}>Data</Label>
            <Input
              id={`data-${transacao.transacaoId}`}
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-3">
          <Label htmlFor={`categoria-${transacao.transacaoId}`}>Categoria</Label>
          <Select
            id={`categoria-${transacao.transacaoId}`}
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
          >
            <option value="">Sem categoria</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </div>

        <div className="mt-3">
          <Label htmlFor={`descricao-${transacao.transacaoId}`}>Descrição</Label>
          <Input
            id={`descricao-${transacao.transacaoId}`}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Opcional"
          />
        </div>

        {erro ? <p className="mt-2 text-sm text-negativo">{erro}</p> : null}

        {confirmacao?.acao === 'editar-retroativo' ? (
          <ConfirmInline
            className="mt-3"
            titulo={TITULO_RETROATIVO}
            descricao={descricaoRetroativo(confirmacao.ciclosAfetados)}
            confirmLabel="Confirmar"
            cancelLabel="Cancelar"
            pendente={pendente}
            onConfirm={confirmarAcaoPendente}
            onCancel={cancelarConfirmacao}
          />
        ) : (
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pendente}
              onClick={() => setEditando(false)}
            >
              Cancelar
            </Button>
            <Button type="button" variant="primary" size="sm" disabled={pendente} onClick={salvarEdicao}>
              Salvar
            </Button>
          </div>
        )}
      </li>
    );
  }

  const confirmInline = (() => {
    if (!confirmacao) return null;
    if (confirmacao.acao === 'excluir-destrutivo') {
      return (
        <ConfirmInline
          titulo="Excluir esta transação?"
          descricao="Esta ação não pode ser desfeita."
          confirmLabel="Excluir"
          cancelLabel="Cancelar"
          tone="negativo"
          pendente={pendente}
          onConfirm={confirmarAcaoPendente}
          onCancel={cancelarConfirmacao}
        />
      );
    }
    if (confirmacao.acao === 'excluir-retroativo') {
      return (
        <ConfirmInline
          titulo={TITULO_RETROATIVO}
          descricao={descricaoRetroativo(confirmacao.ciclosAfetados)}
          confirmLabel="Confirmar"
          cancelLabel="Cancelar"
          pendente={pendente}
          onConfirm={confirmarAcaoPendente}
          onCancel={cancelarConfirmacao}
        />
      );
    }
    return null;
  })();

  return (
    <>
      <li className="grid grid-cols-[3rem_1fr_9rem_6rem_7rem_5.5rem] items-center gap-3 py-2.5">
        <div className="text-xs text-faint">{formatarDataCurta(transacao.data)}</div>

        <div className="min-w-0">
          <p className="truncate text-sm text-fg">{descricaoExibida}</p>
          {erro ? <p className="mt-1 text-xs text-negativo">{erro}</p> : null}
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
            <span className="tnum text-sm font-medium text-negativo">
              -{formatBRL(transacao.valorCents)}
            </span>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-1">
          <button
            type="button"
            onClick={abrirEdicao}
            disabled={pendente}
            aria-label="Editar transação"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-50"
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            onClick={excluir}
            disabled={pendente}
            aria-label="Excluir transação"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-negativo disabled:opacity-50"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </li>
      {confirmInline ? <li className="py-3">{confirmInline}</li> : null}
    </>
  );
}

export function ExtratoVariaveis({
  transacoes,
  totalCents,
  categoriasLancamento,
}: {
  transacoes: LinhaTransacaoVariavel[];
  totalCents: number;
  categoriasLancamento: OpcaoCategoria[];
}) {
  const categoriasVariaveis = categoriasLancamento.filter((c) => c.grupo === 'VARIAVEL');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Extrato de gastos variáveis</CardTitle>
      </CardHeader>
      <CardContent>
        {transacoes.length === 0 ? (
          <EmptyState
            titulo="Nenhum gasto variável lançado neste ciclo ainda"
            descricao='É aqui que aparecem, dia a dia, os gastos que consomem sua verba variável — mercado, lazer, transporte. Clique em "Lançar gasto" na barra lateral (ou pressione N) para começar o extrato.'
          />
        ) : (
          <>
            <div className="grid grid-cols-[3rem_1fr_9rem_6rem_7rem_5.5rem] gap-3 border-b border-border pb-2 text-xs uppercase tracking-wide text-faint">
              <span>Data</span>
              <span>Descrição</span>
              <span>Categoria</span>
              <span>Método</span>
              <span className="text-right">Valor</span>
              <span className="text-right">Ações</span>
            </div>
            <ul className={cn('divide-y divide-border')}>
              {transacoes.map((t) => (
                <LinhaExtratoVariavel key={t.transacaoId} transacao={t} categorias={categoriasVariaveis} />
              ))}
            </ul>
            <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
              <span className="text-sm font-medium text-fg">Total do extrato</span>
              <span className="tnum text-lg font-semibold text-fg">{formatBRL(totalCents)}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
