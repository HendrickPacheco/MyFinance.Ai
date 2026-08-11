'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Segmented,
  Toast,
} from '@/components/ui';
import {
  ParceladosTabela,
  ordenarParcelamentos,
  ORDENACAO_PADRAO,
  type ColunaParcelados,
  type OrdenacaoParcelados,
} from './parcelados-tabela';
import { ParceladosListaMobile } from './parcelados-lista-mobile';
import { EncerrarParcelamentoDialog } from './encerrar-parcelamento-dialog';
import {
  ParcelamentoModal,
  type ParcelamentoEmEdicao,
} from '@/components/dashboard/parcelamento-modal';
import { AbrirParcelamentoBotao } from '@/components/dashboard/parcelamento-botao';
import { encerrarParcelamento, previaEncerramento } from '@/actions/parcelamentos';
import type { EstadoParcelados, LinhaParcelamentoGestao } from '@/application/parcelados-view';
import type { PreviaEncerramento } from '@/application/parcelamentos';
import { formatBRL, somaCents } from '@/shared/dinheiro';

const MS_TOAST = 6000;

type Aba = 'andamento' | 'encerrados';

/**
 * Orquestrador de `/custos/parcelados`: detém a aba, a ordenação, as linhas
 * expandidas, o alvo de edição e a prévia do encerramento. A tabela
 * (desktop), a lista (mobile), o diálogo e o modal são apresentacionais e
 * recebem tudo por props — assim as duas superfícies nunca discordam sobre o
 * que uma ação faz (mesmo desenho do `FixosPainel` da Fase 7).
 *
 * Nenhum número aqui é calculado a partir de outro: `valorMensalCents`,
 * `valorRestanteCents`, `terminaEm`, `parcelaCorrente` e as contagens do
 * diálogo vêm todos do servidor, derivados das `Transacao` reais.
 */
export function ParceladosPainel({ estado }: { estado: EstadoParcelados }) {
  const router = useRouter();
  const [pendente, startTransition] = React.useTransition();
  const [aba, setAba] = React.useState<Aba>('andamento');
  const [ordenacao, setOrdenacao] = React.useState<OrdenacaoParcelados>(ORDENACAO_PADRAO);
  const [expandidos, setExpandidos] = React.useState<ReadonlySet<string>>(new Set());
  const [editando, setEditando] = React.useState<ParcelamentoEmEdicao | null>(null);
  const [previa, setPrevia] = React.useState<PreviaEncerramento | null>(null);
  const [ciclosRetroativos, setCiclosRetroativos] = React.useState<string[] | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [mensagem, setMensagem] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!mensagem) return;
    const t = window.setTimeout(() => setMensagem(null), MS_TOAST);
    return () => window.clearTimeout(t);
  }, [mensagem]);

  const emAndamento = estado.linhas.filter((l) => l.resumo.encerradoEm == null);
  const encerrados = estado.linhas.filter((l) => l.resumo.encerradoEm != null);
  const visiveis = aba === 'andamento' ? emAndamento : encerrados;

  const ordenadas = React.useMemo(
    () => ordenarParcelamentos(visiveis, ordenacao),
    [visiveis, ordenacao],
  );

  // Só o que está em andamento consome teto — somar as encerradas inflaria o
  // compromisso mensal com dívida já cancelada.
  const totalMensalCents = somaCents(emAndamento.map((l) => l.resumo.valorMensalCents));

  const alternarOrdem = (coluna: ColunaParcelados) =>
    setOrdenacao((atual) =>
      atual.coluna === coluna
        ? { coluna, direcao: atual.direcao === 'asc' ? 'desc' : 'asc' }
        : { coluna, direcao: coluna === 'compra' || coluna === 'termina' ? 'asc' : 'desc' },
    );

  const alternarExpansao = (id: string) =>
    setExpandidos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });

  const abrirEncerramento = (linha: LinhaParcelamentoGestao) => {
    setErro(null);
    setCiclosRetroativos(null);
    startTransition(async () => {
      // A prévia é uma IDA AO SERVIDOR de propósito (§4.2): os números do
      // diálogo saem da mesma partição que o encerramento vai usar. Derivá-los
      // do read-model já carregado seria uma segunda implementação do critério
      // "futura", livre para divergir da primeira.
      const r = await previaEncerramento(linha.resumo.id);
      if (r.ok) setPrevia(r.data);
      else setErro(r.erro);
    });
  };

  const confirmarEncerramento = () => {
    if (!previa) return;
    const alvoId = previa.parcelamentoId;
    startTransition(async () => {
      const r = await encerrarParcelamento(alvoId, ciclosRetroativos !== null);
      if (r.ok) {
        setPrevia(null);
        setCiclosRetroativos(null);
        setMensagem(
          `${r.data.parcelasCanceladas} ${r.data.parcelasCanceladas === 1 ? 'parcela cancelada' : 'parcelas canceladas'}, ` +
            `${r.data.parcelasPreservadas} ${r.data.parcelasPreservadas === 1 ? 'preservada' : 'preservadas'} no histórico.`,
        );
        router.refresh();
        return;
      }
      if (r.requerConfirmacao) {
        // Segundo passo (R2): o diálogo continua aberto, com os mesmos
        // números, e passa a dizer que ciclos fechados serão recalculados.
        setCiclosRetroativos(r.ciclosAfetados ?? []);
        return;
      }
      setPrevia(null);
      setErro(r.erro);
    });
  };

  const abrirEdicao = (linha: LinhaParcelamentoGestao) => {
    const { resumo } = linha;
    const travado =
      resumo.encerradoEm != null || resumo.parcelasPagas > 0 || resumo.parcelasEmCicloFechado > 0;
    setEditando({
      id: resumo.id,
      descricao: resumo.descricao,
      valorTotalCents: resumo.valorTotalCents,
      numParcelas: resumo.numParcelas,
      dataCompra: resumo.dataCompra,
      categoriaId: resumo.categoriaId,
      metodo: resumo.metodoAtual,
      travadoPor: travado
        ? {
            parcelasPagas: resumo.parcelasPagas,
            parcelasEmCicloFechado: resumo.parcelasEmCicloFechado,
            encerrado: resumo.encerradoEm != null,
          }
        : null,
    });
  };

  const acoes = { onEditar: abrirEdicao, onEncerrar: abrirEncerramento };

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        {/* "em andamento" distingue este total do da barra de totais, que vem
            do ciclo CONGELADO — mesma lição da Fase 7: dois números certos,
            lado a lado e sem rótulo, leem-se como erro de soma. */}
        <CardTitle>
          Compras parceladas · em andamento {formatBRL(totalMensalCents)}/mês
        </CardTitle>
        <div className="flex items-center gap-3">
          <Segmented
            ariaLabel="Filtrar compras parceladas"
            valor={aba}
            onChange={setAba}
            opcoes={[
              { value: 'andamento', label: `Em andamento (${emAndamento.length})` },
              { value: 'encerrados', label: `Encerrados (${encerrados.length})` },
            ]}
          />
          <AbrirParcelamentoBotao />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {ordenadas.length === 0 ? (
          <EmptyState
            titulo={
              aba === 'andamento'
                ? 'Nenhuma compra parcelada em andamento'
                : 'Nenhuma compra encerrada'
            }
            descricao={
              aba === 'andamento'
                ? 'Compras parceladas aparecem aqui uma linha por COMPRA, com quanto cada uma consome do teto por mês e quando termina.'
                : 'Compras cujas parcelas futuras foram canceladas ficam aqui — o histórico do que foi pago continua intacto.'
            }
          />
        ) : (
          <>
            <div className="hidden lg:block">
              <ParceladosTabela
                linhas={ordenadas}
                ordenacao={ordenacao}
                onOrdenar={alternarOrdem}
                expandidos={expandidos}
                onAlternarExpansao={alternarExpansao}
                {...acoes}
              />
            </div>
            <div className="lg:hidden">
              <ParceladosListaMobile
                linhas={ordenadas}
                expandidos={expandidos}
                onAlternarExpansao={alternarExpansao}
                {...acoes}
              />
            </div>
          </>
        )}

        {erro ? (
          <p role="alert" className="text-sm text-negativo">
            {erro}
          </p>
        ) : null}
      </CardContent>

      <EncerrarParcelamentoDialog
        previa={previa}
        pendente={pendente}
        ciclosAfetados={ciclosRetroativos}
        onConfirmar={confirmarEncerramento}
        onCancelar={() => {
          setPrevia(null);
          setCiclosRetroativos(null);
        }}
      />

      {/* Duas instâncias do MESMO modal, e não uma com um enum de modo: a de
          cima escuta o evento de `window` que `AbrirParcelamentoBotao` dispara
          (o caminho de criação de sempre), a de baixo é controlada por props.
          `Modal` não renderiza nada fechado, então nunca há dois diálogos —
          nem dois `id` iguais — no DOM ao mesmo tempo. */}
      <ParcelamentoModal hoje={estado.hoje} categorias={[...estado.categorias]} />

      <ParcelamentoModal
        hoje={estado.hoje}
        categorias={[...estado.categorias]}
        edicao={{
          alvo: editando,
          onFechar: () => setEditando(null),
          onSalvo: (texto) => {
            setEditando(null);
            setMensagem(texto);
          },
        }}
      />

      {mensagem ? <Toast texto={mensagem} /> : null}
    </Card>
  );
}
