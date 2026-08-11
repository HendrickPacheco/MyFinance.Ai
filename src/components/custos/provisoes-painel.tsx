'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmInline,
  EmptyState,
  Input,
  Label,
  Select,
  Toast,
} from '@/components/ui';
import { CampoDinheiro } from './campo-dinheiro';
import {
  ProvisoesListaMobile,
  ProvisoesTabela,
  mensalDaProvisao,
  ordenarProvisoes,
  type ColunaProvisoes,
  type OrdenacaoProvisoes,
} from './provisoes-tabela';
import { ExcluirFixoDialog, type ExclusaoBloqueada } from './excluir-fixo-dialog';
import { mensagemDoEfeito } from './mensagem-efeito';
import {
  desativarProvisao,
  excluirProvisao,
  reativarProvisao,
  upsertProvisao,
} from '@/actions/config';
import type { EfeitoNoCicloAtual } from '@/application/ciclos';
import type { Resultado } from '@/actions/resultado';
import type { ProvisaoAnual } from '@/domain/model/entidades';
import { formatBRL, somaCents } from '@/shared/dinheiro';
import { MESES_ABREVIADOS_PT_BR, formatarDataCurta, type DataCivil } from '@/shared/data';

const MS_TOAST = 6000;

type AcaoConfirmavel = 'desativar' | 'reativar' | 'excluir';

interface Confirmacao {
  provisao: ProvisaoAnual;
  acao: AcaoConfirmavel;
}

/**
 * Prefixo do toast por ação. O resto da frase — as datas e os dois valores de
 * verba — vem de `mensagemDoEfeito`, a partir do que o servidor devolveu.
 */
const PREFIXO: Record<AcaoConfirmavel, (nome: string) => string> = {
  desativar: (nome) => `“${nome}” desativada.`,
  reativar: (nome) => `“${nome}” reativada.`,
  excluir: (nome) => `“${nome}” excluída.`,
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
  desativar: (id) => desativarProvisao({ id }),
  reativar: (id) => reativarProvisao({ id }),
  excluir: (id) => excluirProvisao({ id }),
};

export function ProvisoesPainel({
  provisoes,
  proximoInicio,
}: {
  provisoes: readonly ProvisaoAnual[];
  proximoInicio: DataCivil | null;
}) {
  const router = useRouter();
  const [pendente, startTransition] = React.useTransition();
  const [ordenacao, setOrdenacao] = React.useState<OrdenacaoProvisoes>({
    coluna: 'anual',
    direcao: 'desc',
  });
  const [editando, setEditando] = React.useState<ProvisaoAnual | null>(null);
  const [nome, setNome] = React.useState('');
  const [valorAnualCents, setValorAnualCents] = React.useState(0);
  const [mes, setMes] = React.useState('');
  const [confirmacao, setConfirmacao] = React.useState<Confirmacao | null>(null);
  const [bloqueio, setBloqueio] = React.useState<ProvisaoAnual | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [mensagem, setMensagem] = React.useState<string | null>(null);
  const nomeRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!mensagem) return;
    const t = window.setTimeout(() => setMensagem(null), MS_TOAST);
    return () => window.clearTimeout(t);
  }, [mensagem]);

  React.useEffect(() => {
    setNome(editando?.nome ?? '');
    setValorAnualCents(editando?.valorAnualCents ?? 0);
    setMes(editando?.mesEsperado ? String(editando.mesEsperado) : '');
    if (editando) nomeRef.current?.focus();
  }, [editando]);

  const ordenadas = React.useMemo(
    () => ordenarProvisoes(provisoes, ordenacao),
    [provisoes, ordenacao],
  );
  const mensalTotalCents = somaCents(
    provisoes.filter((p) => p.ativo).map((p) => mensalDaProvisao(p)),
  );

  const alternarOrdem = (coluna: ColunaProvisoes) =>
    setOrdenacao((atual) =>
      atual.coluna === coluna
        ? { coluna, direcao: atual.direcao === 'asc' ? 'desc' : 'asc' }
        : { coluna, direcao: coluna === 'nome' ? 'asc' : 'desc' },
    );

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

  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    executar(
      editando ? 'Provisão salva.' : 'Provisão criada.',
      async () => {
        const r = await upsertProvisao({
          id: editando?.id ?? '',
          nome: nome.trim(),
          valorAnualCents,
          mesEsperado: mes === '' ? null : Number(mes),
          // O acumulado é dinheiro real já reservado — o formulário de cadastro
          // nunca o reescreve. Quem o move é o fechamento de ciclo.
          acumuladoCents: editando?.acumuladoCents ?? 0,
          ativo: editando?.ativo ?? true,
        });
        return r.ok ? { ok: true as const, data: r.data.efeito } : r;
      },
      () => setEditando(null),
    );
  };

  const confirmar = () => {
    if (!confirmacao) return;
    const { provisao, acao } = confirmacao;
    executar(
      PREFIXO[acao](provisao.nome),
      () => CHAMAR[acao](provisao.id),
      () => {
        setConfirmacao(null);
        if (editando?.id === provisao.id) setEditando(null);
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
      return `Ela para de entrar no cálculo da verba a partir do próximo ciclo${
        proximoInicio ? ` (${formatarDataCurta(proximoInicio)})` : ''
      } e some desta lista. Os ciclos já fechados continuam com o valor que tinham. Dá para reativar quando quiser.`;
    }
    if (acao === 'excluir') {
      return 'O acumulado dela é R$ 0,00 e nenhum gasto foi lançado contra ela. Excluir não afeta histórico nenhum.';
    }
    return undefined;
  };

  const acoes = {
    onEditar: (p: ProvisaoAnual) => {
      setConfirmacao(null);
      setEditando(p);
    },
    onDesativar: (p: ProvisaoAnual) => setConfirmacao({ provisao: p, acao: 'desativar' }),
    onReativar: (p: ProvisaoAnual) => setConfirmacao({ provisao: p, acao: 'reativar' }),
    onExcluir: (p: ProvisaoAnual) => setConfirmacao({ provisao: p, acao: 'excluir' }),
    onExplicarBloqueio: (p: ProvisaoAnual) => setBloqueio(p),
  };

  const alvoBloqueado: ExclusaoBloqueada | null = bloqueio
    ? {
        nome: bloqueio.nome,
        motivo: { tipo: 'acumulado', acumuladoCents: bloqueio.acumuladoCents },
      }
    : null;

  return (
    <Card>
      <CardHeader>
        {/* Ver `fixos-painel.tsx`: "cadastro atual" separa este total do da
            barra de totais, que vem do ciclo congelado. */}
        <CardTitle>Provisões anuais · cadastro atual {formatBRL(mensalTotalCents)}/mês</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted">
          Custos que não caem todo mês (IPVA, seguro, presentes). Somados no ano e divididos por 12
          viram custo mensal — a causa raiz do &quot;estourei sem motivo em dezembro&quot;.
        </p>

        {provisoes.length === 0 ? (
          <EmptyState
            titulo="Nenhuma provisão cadastrada"
            descricao="IPVA, seguro, matrícula — o que chega uma vez por ano e derruba um mês inteiro. Cadastre abaixo para diluir o valor em doze."
          />
        ) : (
          <>
            <div className="hidden lg:block">
              <ProvisoesTabela
                provisoes={ordenadas}
                ordenacao={ordenacao}
                onOrdenar={alternarOrdem}
                {...acoes}
              />
            </div>
            <div className="lg:hidden">
              <ProvisoesListaMobile provisoes={ordenadas} {...acoes} />
            </div>
          </>
        )}

        {confirmacao ? (
          <ConfirmInline
            tone={confirmacao.acao === 'excluir' ? 'negativo' : 'neutral'}
            titulo={TITULO[confirmacao.acao](confirmacao.provisao.nome)}
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

        <form onSubmit={salvar} className="rounded-xl border border-border-strong p-3">
          <p className="mb-3 text-sm text-muted">
            {editando ? `Editando: ${editando.nome}` : 'Nova provisão'}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="provisao-nome">Nome</Label>
              <Input
                ref={nomeRef}
                id="provisao-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: IPVA"
              />
            </div>
            <div>
              <Label htmlFor="provisao-valor">Valor no ano</Label>
              <CampoDinheiro
                id="provisao-valor"
                valorCents={valorAnualCents}
                onChange={setValorAnualCents}
              />
            </div>
            <div>
              <Label htmlFor="provisao-mes">Mês esperado</Label>
              <Select id="provisao-mes" value={mes} onChange={(e) => setMes(e.target.value)}>
                <option value="">sem mês definido</option>
                {MESES_ABREVIADOS_PT_BR.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <p className="tnum mt-2 text-xs text-faint">
            {valorAnualCents > 0
              ? `Vira ${formatBRL(Math.floor(valorAnualCents / 12))} por mês no cálculo da verba.`
              : 'O valor anual é dividido por 12 e entra como custo mensal.'}
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" type="submit" disabled={pendente || nome.trim() === ''}>
              <Plus size={16} aria-hidden /> {editando ? 'Salvar' : 'Adicionar'}
            </Button>
            {editando ? (
              <Button size="sm" type="button" variant="ghost" onClick={() => setEditando(null)}>
                Cancelar edição
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>

      <ExcluirFixoDialog
        alvo={alvoBloqueado}
        pendente={pendente}
        onDesativar={() => {
          if (!bloqueio) return;
          const alvo = bloqueio;
          setBloqueio(null);
          executar(`“${alvo.nome}” desativada.`, () => desativarProvisao({ id: alvo.id }));
        }}
        onCancelar={() => setBloqueio(null)}
      />

      {mensagem ? <Toast texto={mensagem} /> : null}
    </Card>
  );
}
