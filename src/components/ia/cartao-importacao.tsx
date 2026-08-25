'use client';

/**
 * O cartão de revisão de uma importação de fatura (D-18 revista, 25/08/2026
 * — `TASKS-IMPORTACAO.md` §15.7). Renderizado no lugar de `CartaoProposta`
 * quando `PropostaExibivel.proposta.tipo === 'IMPORTACAO'` (ver
 * `resposta-com-proveniencia.tsx`).
 *
 * ─── POR QUE ESTE CARTÃO NÃO TEM UM BOTÃO ÚNICO ───
 *
 * `confirmarProposta` (`actions/ia.ts`) recusa explicitamente `tipo:
 * 'IMPORTACAO'` — nenhum clique aqui chama essa action. Cada linha
 * `NOVO`/`PRECISA_DE_VOCE` é confirmada INDIVIDUALMENTE via
 * `confirmarItemImportadoAction` (`actions/importacao.ts`), que só faz
 * `criarTransacao`/`criarParcelamento`/`marcarCustoFixoPago` — os mesmos
 * casos de uso de sempre. O que já casa com um registro existente
 * (`JA_REGISTRADO`) ou é um custo fixo reconhecido (`CUSTO_FIXO_RECONHECIDO`)
 * não pede julgamento do dono, mas ainda precisa ser RESOLVIDO no banco
 * (`ItemImportado.decisao` sai de `PENDENTE`) para `finalizarImportacaoAction`
 * aceitar fechar o rascunho — por isso essas duas faixas ficam colapsadas
 * (§15.7) mas ainda têm um botão de resolução em lote, não escondido.
 *
 * ─── POR QUE ESTE CARTÃO CONTINUA INTERATIVO NUMA CONVERSA REABERTA ───
 *
 * `cartao-proposta-inerte.tsx` existe porque, para LANÇAMENTO/PARCELAMENTO/
 * MEMÓRIA, o app genuinamente não sabe se aquela proposta já foi executada
 * ao reabrir uma conversa antiga — reclicar chamaria `criarTransacao` de
 * novo, sem nenhuma trava de identidade.
 *
 * Aqui é diferente: CADA linha tem uma identidade própria e persistida
 * (`ItemImportado.id`) e `confirmarItemImportado` já é idempotente por
 * construção — dupla chamada na MESMA linha devolve `JA_PROCESSADA` (a
 * decisão já não é `PENDENTE`) ou, na pior corrida, esbarra na constraint
 * de unicidade (`ItemImportadoJaGravadoError`), tratada como sucesso sem
 * gravar de novo. Ou seja: a segurança contra "gravar duas vezes" não vem
 * de esconder o botão depois de reabrir a conversa — vem do próprio caso de
 * uso, que é seguro para ser chamado de novo. Por isso este componente é o
 * MESMO em `RespostaComProveniencia` (turno ao vivo) e `RespostaHistorico`
 * (turno reaberto): não existe uma "CartaoImportacaoInerte". Um resultado
 * `JA_PROCESSADA` é tratado como informação ("essa linha já tinha sido
 * resolvida"), nunca como erro.
 */
import * as React from 'react';
import { AlertTriangle, Check, ChevronDown, Loader2, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { confirmarItemImportadoAction, descartarItemImportadoAction, finalizarImportacaoAction } from '@/actions/importacao';
import { formatarDataCurta } from '@/shared/data';
import { formatBRL } from '@/shared/dinheiro';
import type { PropostaImportacao, ItemPropostaImportacao, FAIXAS_PROPONIVEIS } from '@/application/ia/propostas';

type Faixa = (typeof FAIXAS_PROPONIVEIS)[number];

/** Estado local de UMA linha. `JA_PROCESSADA` cobre tanto o retorno explícito quanto uma corrida vencida por outra aba. */
type EstadoLinha =
  | { tipo: 'PENDENTE' }
  | { tipo: 'ENVIANDO' }
  | { tipo: 'CONFIRMADA' }
  | { tipo: 'DESCARTADA' }
  | { tipo: 'JA_PROCESSADA'; decisaoAnterior: string }
  | { tipo: 'ERRO'; mensagem: string };

const ROTULO_FAIXA: Record<Faixa, string> = {
  JA_REGISTRADO: 'Já registrado',
  CUSTO_FIXO_RECONHECIDO: 'Custo fixo reconhecido',
  NOVO: 'Novo',
  PRECISA_DE_VOCE: 'Precisa de você',
  IGNORADO: 'Ignorado',
};

const ORDEM_FAIXAS: Faixa[] = ['JA_REGISTRADO', 'CUSTO_FIXO_RECONHECIDO', 'NOVO', 'PRECISA_DE_VOCE', 'IGNORADO'];

function agruparPorFaixa(itens: readonly ItemPropostaImportacao[]): Record<Faixa, ItemPropostaImportacao[]> {
  const grupos: Record<Faixa, ItemPropostaImportacao[]> = {
    JA_REGISTRADO: [],
    CUSTO_FIXO_RECONHECIDO: [],
    NOVO: [],
    PRECISA_DE_VOCE: [],
    IGNORADO: [],
  };
  for (const item of itens) grupos[item.faixa].push(item);
  return grupos;
}

/** Uma linha, com data/descrição/valor sempre visíveis (§15.4) e o botão que decide o que acontece com ela. */
function LinhaImportacao({
  item,
  importacaoId,
  estado,
  onMudarEstado,
  mostrarMotivo,
}: {
  item: ItemPropostaImportacao;
  importacaoId: string;
  estado: EstadoLinha;
  onMudarEstado: (proximo: EstadoLinha) => void;
  mostrarMotivo: boolean;
}) {
  const confirmar = React.useCallback(async () => {
    // Guarda contra duplo clique local (padrão de `cartao-proposta.tsx`) —
    // a segurança de verdade é do caso de uso (ver docblock do módulo).
    if (estado.tipo !== 'PENDENTE') return;
    onMudarEstado({ tipo: 'ENVIANDO' });

    const resultado = await confirmarItemImportadoAction({ importacaoId, itemId: item.itemId });
    if (!resultado.ok) {
      onMudarEstado({ tipo: 'ERRO', mensagem: resultado.erro });
      return;
    }
    const { data } = resultado;
    if (data.status === 'JA_PROCESSADA') {
      onMudarEstado({ tipo: 'JA_PROCESSADA', decisaoAnterior: data.decisaoAnterior });
    } else if (data.status === 'IGNORADA') {
      onMudarEstado({ tipo: 'DESCARTADA' });
    } else {
      onMudarEstado({ tipo: 'CONFIRMADA' });
    }
  }, [estado.tipo, importacaoId, item.itemId, onMudarEstado]);

  const descartar = React.useCallback(async () => {
    if (estado.tipo !== 'PENDENTE') return;
    onMudarEstado({ tipo: 'ENVIANDO' });

    const resultado = await descartarItemImportadoAction({ importacaoId, itemId: item.itemId });
    if (!resultado.ok) {
      onMudarEstado({ tipo: 'ERRO', mensagem: resultado.erro });
      return;
    }
    onMudarEstado({ tipo: 'DESCARTADA' });
  }, [estado.tipo, importacaoId, item.itemId, onMudarEstado]);

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="tnum text-xs text-muted">{item.data ? formatarDataCurta(item.data) : 'data indefinida'}</span>
          <span className="truncate text-sm text-fg">{item.descricao}</span>
          <span className="tnum ml-auto text-sm font-medium text-fg sm:ml-0">
            {item.valorFormatado ?? ''}
          </span>
        </div>
        {mostrarMotivo ? (
          <p className="mt-1 flex items-start gap-1.5 text-xs text-atencao">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {item.vereditoMotivo ?? 'Motivo não informado.'}
          </p>
        ) : null}
        {estado.tipo === 'ERRO' ? (
          <p className="mt-1 text-xs text-negativo" role="alert">
            {estado.mensagem}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
        {estado.tipo === 'CONFIRMADA' ? (
          <span className="flex items-center gap-1 text-xs font-medium text-positivo">
            <Check className="size-3.5" aria-hidden /> Confirmada
          </span>
        ) : estado.tipo === 'DESCARTADA' ? (
          <span className="flex items-center gap-1 text-xs text-muted">
            <Undo2 className="size-3.5" aria-hidden /> Descartada
          </span>
        ) : estado.tipo === 'JA_PROCESSADA' ? (
          <span className="text-xs text-muted">Já resolvida antes ({estado.decisaoAnterior.toLowerCase()})</span>
        ) : (
          <>
            <Button
              type="button"
              size="sm"
              onClick={() => void confirmar()}
              disabled={estado.tipo === 'ENVIANDO'}
            >
              {estado.tipo === 'ENVIANDO' ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Check className="size-3.5" aria-hidden />
              )}
              {estado.tipo === 'ERRO' ? 'Tentar de novo' : 'Confirmar'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void descartar()}
              disabled={estado.tipo === 'ENVIANDO'}
            >
              <X className="size-3.5" aria-hidden />
              Descartar
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

/** Uma faixa que "não pede nada" — colapsada, com contagem/total e um botão de resolução em lote. */
function FaixaColapsada({
  faixa,
  itens,
  importacaoId,
  estados,
  onMudarEstado,
  textoAcao,
}: {
  faixa: Faixa;
  itens: ItemPropostaImportacao[];
  importacaoId: string;
  estados: Record<string, EstadoLinha>;
  onMudarEstado: (itemId: string, proximo: EstadoLinha) => void;
  textoAcao: string;
}) {
  const [resolvendo, setResolvendo] = React.useState(false);
  const totalCents = itens.reduce((soma, item) => soma + item.valorCents, 0);

  const pendentes = itens.filter((item) => (estados[item.itemId]?.tipo ?? 'PENDENTE') === 'PENDENTE');

  const resolverTodas = React.useCallback(async () => {
    setResolvendo(true);
    // Sequencial de propósito: cada chamada já é barata (sem I/O de IA) e
    // sequencial evita martelar o banco com N chamadas simultâneas para uma
    // fatura de centenas de linhas.
    for (const item of pendentes) {
      onMudarEstado(item.itemId, { tipo: 'ENVIANDO' });
      const resultado = await confirmarItemImportadoAction({ importacaoId, itemId: item.itemId });
      if (!resultado.ok) {
        onMudarEstado(item.itemId, { tipo: 'ERRO', mensagem: resultado.erro });
        continue;
      }
      const { data } = resultado;
      if (data.status === 'JA_PROCESSADA') {
        onMudarEstado(item.itemId, { tipo: 'JA_PROCESSADA', decisaoAnterior: data.decisaoAnterior });
      } else if (data.status === 'IGNORADA') {
        onMudarEstado(item.itemId, { tipo: 'DESCARTADA' });
      } else {
        onMudarEstado(item.itemId, { tipo: 'CONFIRMADA' });
      }
    }
    setResolvendo(false);
  }, [importacaoId, onMudarEstado, pendentes]);

  if (itens.length === 0) return null;

  return (
    <details className="group rounded-lg border border-border bg-surface-2/50 px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-2">
          <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" aria-hidden />
          <span className="font-medium text-fg">{ROTULO_FAIXA[faixa]}</span>
          <span className="tnum text-xs text-muted">
            {itens.length} linha{itens.length === 1 ? '' : 's'} · {formatBRL(totalCents)}
          </span>
        </span>
        {pendentes.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.preventDefault();
              void resolverTodas();
            }}
            disabled={resolvendo}
          >
            {resolvendo ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            {textoAcao}
          </Button>
        ) : (
          <span className="text-xs text-positivo">Resolvido</span>
        )}
      </summary>

      <ul className="mt-2 space-y-1.5">
        {itens.map((item) => {
          const estado = estados[item.itemId] ?? { tipo: 'PENDENTE' as const };
          return (
            <li key={item.itemId} className="flex items-center justify-between gap-2 px-1 py-1 text-xs text-muted">
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="tnum">{item.data ? formatarDataCurta(item.data) : '—'}</span>
                <span className="truncate">{item.descricao}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="tnum">{item.valorFormatado}</span>
                {estado.tipo === 'CONFIRMADA' || estado.tipo === 'JA_PROCESSADA' ? (
                  <Check className="size-3.5 text-positivo" aria-hidden />
                ) : estado.tipo === 'DESCARTADA' ? (
                  <Undo2 className="size-3.5" aria-hidden />
                ) : estado.tipo === 'ERRO' ? (
                  <AlertTriangle className="size-3.5 text-negativo" aria-hidden />
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

export function CartaoImportacao({ proposta }: { proposta: PropostaImportacao }) {
  const [estados, setEstados] = React.useState<Record<string, EstadoLinha>>({});
  const [finalizando, setFinalizando] = React.useState(false);
  const [avisoFinalizacao, setAvisoFinalizacao] = React.useState<string | null>(null);

  const mudarEstado = React.useCallback((itemId: string, proximo: EstadoLinha) => {
    setEstados((atual) => ({ ...atual, [itemId]: proximo }));
  }, []);

  const grupos = React.useMemo(() => agruparPorFaixa(proposta.itens), [proposta.itens]);

  const finalizar = React.useCallback(async () => {
    setFinalizando(true);
    setAvisoFinalizacao(null);
    const resultado = await finalizarImportacaoAction({ importacaoId: proposta.importacaoId });
    if (!resultado.ok) {
      setAvisoFinalizacao(resultado.erro);
    } else if (resultado.data.finalizada) {
      setAvisoFinalizacao('Importação finalizada — todas as linhas foram resolvidas.');
    } else {
      setAvisoFinalizacao(
        `Ainda restam ${resultado.data.itensPendentes} linha(s) pendente(s). Resolva-as antes de finalizar.`,
      );
    }
    setFinalizando(false);
  }, [proposta.importacaoId]);

  return (
    <div className="rounded-xl border border-border-strong bg-surface-2 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-fg">
          Fatura {proposta.competenciaRef} · {proposta.itens.length} linha(s)
        </p>
        <p className="tnum text-sm font-semibold text-fg">
          Total: {proposta.totalGeralFormatado ?? ''}
        </p>
      </div>
      <p className="mt-1 text-xs text-muted">
        Confira o total contra o impresso na fatura — a diferença é sinal, não erro escondido.
      </p>

      <div className="mt-3 space-y-2">
        <FaixaColapsada
          faixa="JA_REGISTRADO"
          itens={grupos.JA_REGISTRADO}
          importacaoId={proposta.importacaoId}
          estados={estados}
          onMudarEstado={mudarEstado}
          textoAcao="Marcar conferido"
        />
        <FaixaColapsada
          faixa="CUSTO_FIXO_RECONHECIDO"
          itens={grupos.CUSTO_FIXO_RECONHECIDO}
          importacaoId={proposta.importacaoId}
          estados={estados}
          onMudarEstado={mudarEstado}
          textoAcao="Marcar pagos"
        />

        {grupos.CUSTO_FIXO_RECONHECIDO.length > 0 ? (
          <p className="pl-1 text-xs text-muted">
            Custo fixo reconhecido só marca o pagamento — não cria um gasto novo (já está descontado da verba do
            ciclo).
          </p>
        ) : null}

        {grupos.NOVO.length > 0 ? (
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
              Novo — confirme um a um
            </p>
            <ul className="space-y-1.5">
              {grupos.NOVO.map((item) => (
                <LinhaImportacao
                  key={item.itemId}
                  item={item}
                  importacaoId={proposta.importacaoId}
                  estado={estados[item.itemId] ?? { tipo: 'PENDENTE' }}
                  onMudarEstado={(proximo) => mudarEstado(item.itemId, proximo)}
                  mostrarMotivo={false}
                />
              ))}
            </ul>
          </div>
        ) : null}

        {grupos.PRECISA_DE_VOCE.length > 0 ? (
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-atencao">Precisa de você</p>
            <ul className="space-y-1.5">
              {grupos.PRECISA_DE_VOCE.map((item) => (
                <LinhaImportacao
                  key={item.itemId}
                  item={item}
                  importacaoId={proposta.importacaoId}
                  estado={estados[item.itemId] ?? { tipo: 'PENDENTE' }}
                  onMudarEstado={(proximo) => mudarEstado(item.itemId, proximo)}
                  mostrarMotivo
                />
              ))}
            </ul>
          </div>
        ) : null}

        <FaixaColapsada
          faixa="IGNORADO"
          itens={grupos.IGNORADO}
          importacaoId={proposta.importacaoId}
          estados={estados}
          onMudarEstado={mudarEstado}
          textoAcao="Marcar conferido"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button type="button" size="sm" variant="subtle" onClick={() => void finalizar()} disabled={finalizando}>
          {finalizando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
          Finalizar importação
        </Button>
        {avisoFinalizacao ? <p className="text-xs text-muted">{avisoFinalizacao}</p> : null}
      </div>
    </div>
  );
}
