'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmInline,
  EmptyState,
  Toast,
} from '@/components/ui';
import { FixosTabela, ordenarLinhas, type ColunaFixos, type OrdenacaoFixos } from './fixos-tabela';
import { FixosListaMobile } from './fixos-lista-mobile';
import { FixoForm, type RascunhoCustoFixo } from './fixo-form';
import { ExcluirFixoDialog, type ExclusaoBloqueada } from './excluir-fixo-dialog';
import { mensagemDoEfeito } from './mensagem-efeito';
import {
  desativarCustoFixo,
  excluirCustoFixo,
  reativarCustoFixo,
  upsertCustoFixo,
} from '@/actions/config';
import type { LinhaCustoFixoGestao } from '@/application/custos-view';
import type { OpcaoCategoria } from '@/application/dashboard-tipos';
import type { EfeitoNoCicloAtual } from '@/application/ciclos';
import type { Resultado } from '@/actions/resultado';
import type { CustoFixo } from '@/domain/model/entidades';
import { formatBRL, somaCents } from '@/shared/dinheiro';
import { formatarDataCurta, type DataCivil } from '@/shared/data';

const MS_TOAST = 6000;

type AcaoConfirmavel = 'desativar' | 'reativar' | 'excluir';

interface Confirmacao {
  linha: LinhaCustoFixoGestao;
  acao: AcaoConfirmavel;
}

/**
 * Prefixo do toast por ação. O resto da frase — as datas e os dois valores de
 * verba — vem de `mensagemDoEfeito`, a partir do que o servidor devolveu.
 */
const PREFIXO: Record<AcaoConfirmavel, (nome: string) => string> = {
  desativar: (nome) => `“${nome}” desativado.`,
  reativar: (nome) => `“${nome}” reativado.`,
  excluir: (nome) => `“${nome}” excluído.`,
};

const TITULO: Record<AcaoConfirmavel, (nome: string) => string> = {
  desativar: (nome) => `Desativar “${nome}”?`,
  reativar: (nome) => `Reativar “${nome}”?`,
  excluir: (nome) => `Excluir “${nome}”?`,
};

const CONFIRM_LABEL: Record<AcaoConfirmavel, string> = {
  desativar: 'Desativar',
  reativar: 'Reativar',
  excluir: 'Excluir',
};

const CHAMAR: Record<AcaoConfirmavel, (id: string) => Promise<Resultado<EfeitoNoCicloAtual>>> = {
  desativar: (id) => desativarCustoFixo({ id }),
  reativar: (id) => reativarCustoFixo({ id }),
  excluir: (id) => excluirCustoFixo({ id }),
};

/**
 * Orquestrador de `/custos/fixos`: detém a ordenação, o alvo de edição, a
 * confirmação em curso e a mensagem de efeito. A tabela (desktop), a lista
 * (mobile), o formulário e o diálogo são todos apresentacionais e recebem tudo
 * por props — assim as duas superfícies nunca discordam sobre o que uma ação
 * faz.
 */
export function FixosPainel({
  linhas,
  categorias,
  proximoInicio,
}: {
  linhas: readonly LinhaCustoFixoGestao[];
  /** Opções do select de categoria, já filtradas e ordenadas pelo servidor. */
  categorias: readonly OpcaoCategoria[];
  /** Primeiro dia do próximo ciclo, para a frase de "desativar". */
  proximoInicio: DataCivil | null;
}) {
  const router = useRouter();
  const [pendente, startTransition] = React.useTransition();
  const [ordenacao, setOrdenacao] = React.useState<OrdenacaoFixos>({
    coluna: 'valor',
    direcao: 'desc',
  });
  const [editando, setEditando] = React.useState<CustoFixo | null>(null);
  const [confirmacao, setConfirmacao] = React.useState<Confirmacao | null>(null);
  const [bloqueio, setBloqueio] = React.useState<LinhaCustoFixoGestao | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [mensagem, setMensagem] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!mensagem) return;
    const t = window.setTimeout(() => setMensagem(null), MS_TOAST);
    return () => window.clearTimeout(t);
  }, [mensagem]);

  const ordenadas = React.useMemo(() => ordenarLinhas(linhas, ordenacao), [linhas, ordenacao]);
  const totalAtivoCents = somaCents(
    linhas.filter((l) => l.custo.ativo).map((l) => l.custo.valorCents),
  );

  const alternarOrdem = (coluna: ColunaFixos) =>
    setOrdenacao((atual) =>
      atual.coluna === coluna
        ? { coluna, direcao: atual.direcao === 'asc' ? 'desc' : 'asc' }
        : { coluna, direcao: coluna === 'nome' ? 'asc' : 'desc' },
    );

  /**
   * Caminho único de toda ação de escrita desta tela: executa, traduz o
   * `EfeitoNoCicloAtual` devolvido pelo servidor na frase certa e revalida.
   * Centralizar isto é o que garante que nenhuma ação escape para a frase
   * genérica "vale a partir do próximo ciclo" quando o ciclo foi recalculado.
   */
  const executar = (
    prefixo: string,
    acao: () => Promise<Resultado<EfeitoNoCicloAtual>>,
    aoConcluir?: () => void,
  ) => {
    setErro(null);
    startTransition(async () => {
      const r = await acao();
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setMensagem(mensagemDoEfeito(prefixo, r.data));
      aoConcluir?.();
      router.refresh();
    });
  };

  const salvar = (rascunho: RascunhoCustoFixo) =>
    executar(
      editando ? 'Custo fixo salvo.' : 'Custo fixo criado.',
      async () => {
        const r = await upsertCustoFixo({
          id: editando?.id ?? '',
          nome: rascunho.nome.trim(),
          valorCents: rascunho.valorCents,
          diaVencimento: rascunho.diaVencimento,
          // Editar nunca reativa por acidente um custo desativado: o valor
          // atual é preservado, e reativar é uma ação própria.
          ativo: editando?.ativo ?? true,
          contaId: editando?.contaId ?? null,
          categoriaId: rascunho.categoriaId,
          vigenteDe: rascunho.vigenteDe,
          vigenteAte: rascunho.vigenteAte,
        });
        // `upsert` devolve o cadastro E o efeito; aqui só o efeito interessa,
        // porque a lista já vem revalidada do servidor.
        return r.ok ? { ok: true as const, data: r.data.efeito } : r;
      },
      () => setEditando(null),
    );

  const confirmar = () => {
    if (!confirmacao) return;
    const { linha, acao } = confirmacao;
    executar(
      PREFIXO[acao](linha.custo.nome),
      () => CHAMAR[acao](linha.custo.id),
      () => {
        setConfirmacao(null);
        if (editando?.id === linha.custo.id) setEditando(null);
      },
    );
  };

  /**
   * Detalhe da confirmação. Reativar não tem um: o que ele muda na verba são
   * números que só o servidor conhece, e eles chegam no toast por
   * `mensagemDoEfeito`. Melhor não dizer nada do que dizer algo genérico.
   */
  const descricaoDaConfirmacao = (acao: AcaoConfirmavel): string | undefined => {
    if (acao === 'desativar') {
      return `Ele para de entrar no cálculo da verba a partir do próximo ciclo${
        proximoInicio ? ` (${formatarDataCurta(proximoInicio)})` : ''
      } e some desta lista. Os ciclos já fechados continuam com o valor que tinham. Dá para reativar quando quiser.`;
    }
    if (acao === 'excluir') {
      return 'Ele nunca foi marcado como pago em nenhum ciclo. Excluir não afeta histórico nenhum.';
    }
    return undefined;
  };

  const desativarDoDialogo = (linha: LinhaCustoFixoGestao) => {
    setBloqueio(null);
    executar(`“${linha.custo.nome}” desativado.`, () =>
      desativarCustoFixo({ id: linha.custo.id }),
    );
  };

  const acoes = {
    onEditar: (linha: LinhaCustoFixoGestao) => {
      setConfirmacao(null);
      setEditando(linha.custo);
    },
    onDesativar: (linha: LinhaCustoFixoGestao) =>
      setConfirmacao({ linha, acao: 'desativar' }),
    onReativar: (linha: LinhaCustoFixoGestao) => setConfirmacao({ linha, acao: 'reativar' }),
    onExcluir: (linha: LinhaCustoFixoGestao) => setConfirmacao({ linha, acao: 'excluir' }),
    onExplicarBloqueio: (linha: LinhaCustoFixoGestao) => setBloqueio(linha),
  };

  const alvoBloqueado: ExclusaoBloqueada | null = bloqueio
    ? {
        nome: bloqueio.custo.nome,
        motivo: { tipo: 'pagamentos', ciclosComPagamento: bloqueio.ciclosComPagamento },
      }
    : null;

  return (
    <Card>
      <CardHeader>
        {/* "cadastro atual" distingue este total do da barra de totais, que vem
            do ciclo CONGELADO. Os dois divergem sempre que um custo muda depois
            de o ciclo nascer — sem o rótulo, a diferença lê-se como erro. */}
        <CardTitle>Custos fixos · cadastro atual {formatBRL(totalAtivoCents)}/mês</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {linhas.length === 0 ? (
          <EmptyState
            titulo="Nenhum custo fixo cadastrado"
            descricao="Aluguel, internet, academia — o que sai todo mês no mesmo valor. Cadastre abaixo e a verba do próximo ciclo já nasce descontando."
          />
        ) : (
          <>
            <div className="hidden lg:block">
              <FixosTabela
                linhas={ordenadas}
                ordenacao={ordenacao}
                onOrdenar={alternarOrdem}
                {...acoes}
              />
            </div>
            <div className="lg:hidden">
              <FixosListaMobile linhas={ordenadas} {...acoes} />
            </div>
          </>
        )}

        {confirmacao ? (
          <ConfirmInline
            tone={confirmacao.acao === 'excluir' ? 'negativo' : 'neutral'}
            titulo={TITULO[confirmacao.acao](confirmacao.linha.custo.nome)}
            descricao={descricaoDaConfirmacao(confirmacao.acao)}
            confirmLabel={CONFIRM_LABEL[confirmacao.acao]}
            pendente={pendente}
            onConfirm={confirmar}
            onCancel={() => setConfirmacao(null)}
          />
        ) : null}

        {erro ? (
          <p role="alert" className="text-sm text-negativo">
            {erro}
          </p>
        ) : null}

        <FixoForm
          editando={editando}
          categorias={categorias}
          pendente={pendente}
          erro={null}
          onSubmit={salvar}
          onCancelar={() => setEditando(null)}
        />
      </CardContent>

      <ExcluirFixoDialog
        alvo={alvoBloqueado}
        pendente={pendente}
        onDesativar={() => {
          if (bloqueio) desativarDoDialogo(bloqueio);
        }}
        onCancelar={() => setBloqueio(null)}
      />

      {mensagem ? <Toast texto={mensagem} /> : null}
    </Card>
  );
}
