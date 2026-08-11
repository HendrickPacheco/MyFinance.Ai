'use client';

/**
 * Composição da renda, mês a mês — coluna empilhada de `/projecao`.
 *
 * De baixo para cima: fixos · provisão · poupança-alvo · parcelas · VERBA LIVRE.
 * A verba no topo é a decisão central do gráfico: o topo é o único segmento cuja
 * variação o olho acompanha numa pilha e, como o teto (renda prevista) é quase
 * plano, a altura do segmento superior lê-se direto como "quanto sobra".
 * Parcelas fica colada à verba para que o encolher do laranja e o crescer do
 * azul aconteçam na mesma fronteira.
 *
 * DUAS DECISÕES QUE NÃO SÃO ÓBVIAS NO CÓDIGO:
 *
 * 1. VERBA LIVRE NEGATIVA NÃO EMPILHA. `verbaLivreCents` pode ser negativo
 *    (renda insuficiente, rollover negativo) — é situação real neste app. No
 *    Recharts um valor negativo dentro de um `stackId` desenha para BAIXO do
 *    zero: a coluna cruzaria o eixo, a altura deixaria de ser "renda" e o
 *    encoding inteiro quebraria justo no mês que mais importa. Então a série
 *    plotada é `verbaLivrePlotCents = max(verbaLivre, 0)` — um clamp de
 *    desenho, não de cálculo — e o déficit é comunicado por três canais
 *    redundantes: (a) marcador `⚠ −R$ x` sob o tick em `--color-negativo`,
 *    (b) linha explícita no tooltip, (c) a coluna fica visivelmente mais alta
 *    que as vizinhas, porque os compromissos passam da renda. O valor real
 *    continua íntegro na tabela — nada é escondido, só não é empilhado.
 *
 * 2. O RECHARTS NÃO ENTRA NO BUNDLE DO MOBILE. `hidden lg:block` esconde por
 *    CSS mas o JS continua sendo baixado — o chunk é por rota, não por
 *    viewport. Por isso o `import('recharts')` é DINÂMICO e só dispara depois
 *    que `matchMedia('(min-width: 1024px)')` casa. No celular ("fila do
 *    caixa") a requisição nunca acontece: ~100kb a menos. A tabela-calendário
 *    é a visualização principal lá, e ela é de outro componente.
 */
import { useEffect, useState, type ReactElement } from 'react';
import {
  CORES_PROJECAO,
  LABEL_PROJECAO,
  ORDEM_PILHA_PROJECAO,
  type SerieProjecao,
} from '@/components/dashboard/cores';
import type { LinhaProjecao } from '@/application/projecao-view';
import { ProjecaoTooltip } from './projecao-tooltip';

type ModuloRecharts = typeof import('recharts');

/** Cada série da pilha e o campo do read-model que a alimenta. */
const CHAVE_DADO: Record<SerieProjecao, string> = {
  fixos: 'fixosCents',
  provisao: 'provisaoMensalCents',
  poupanca: 'poupancaAlvoCents',
  parcelas: 'parcelasComprometidasCents',
  verbaLivre: 'verbaLivrePlotCents',
};

interface LinhaPlotada extends LinhaProjecao {
  /** Ver decisão (1) no cabeçalho: clamp de DESENHO da verba livre. */
  verbaLivrePlotCents: number;
  /** Texto do marcador sob o tick, quando existe. */
  marcador: string | null;
  /** Marcador de respiro (verde) x marcador de déficit (vermelho). */
  marcadorNegativo: boolean;
}

function formatarReaisCurto(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100));
}

function formatarEixoY(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(cents / 100);
}

function somaFimDeParcelas(linha: LinhaProjecao): number {
  return linha.terminamNesteCiclo.reduce((total, fim) => total + fim.valorMensalCents, 0);
}

function prepararLinha(linha: LinhaProjecao): LinhaPlotada {
  const deficit = linha.verbaLivreCents < 0;
  const alivioCents = somaFimDeParcelas(linha);
  // Déficit tem precedência sobre respiro: é a notícia que muda a decisão.
  const marcador = deficit
    ? `⚠ −${formatarReaisCurto(Math.abs(linha.verbaLivreCents))}`
    : alivioCents > 0
      ? `⬆ +${formatarReaisCurto(alivioCents)}`
      : null;

  return {
    ...linha,
    verbaLivrePlotCents: Math.max(linha.verbaLivreCents, 0),
    marcador,
    marcadorNegativo: deficit,
  };
}

interface PosicaoTick {
  x: number;
  y: number;
  indice: number;
}

function extrairTick(props: unknown): PosicaoTick | null {
  if (typeof props !== 'object' || props === null) return null;
  const bruto = props as { x?: unknown; y?: unknown; payload?: { index?: unknown } };
  if (typeof bruto.x !== 'number' || typeof bruto.y !== 'number') return null;
  const indice = bruto.payload?.index;
  if (typeof indice !== 'number') return null;
  return { x: bruto.x, y: bruto.y, indice };
}

/**
 * Tick de duas alturas: o mês e, sob ele, o marcador. O marcador é o reforço
 * do EIXO — os outros dois (badge na tabela e manchete em texto) vivem em
 * outros componentes, de propósito: fim de parcela nunca é sinalizado só por
 * cor, nem só num lugar.
 */
function TickPeriodo({
  props,
  linhas,
  rarefazerRotulos,
}: {
  props: unknown;
  linhas: readonly LinhaPlotada[];
  rarefazerRotulos: boolean;
}): ReactElement {
  const tick = extrairTick(props);
  const linha = tick === null ? undefined : linhas[tick.indice];
  if (tick === null || linha === undefined) return <g />;

  // Com 24 colunas os rótulos colidem; rarefaz mês sim/mês não, mas nunca
  // esconde um tick que carrega marcador.
  const mostrarRotulo = !rarefazerRotulos || tick.indice % 2 === 0 || linha.marcador !== null;

  return (
    <g transform={`translate(${String(tick.x)}, ${String(tick.y)})`}>
      {mostrarRotulo ? (
        <text x={0} y={0} dy={12} textAnchor="middle" fill="var(--color-faint)" fontSize={11}>
          {linha.periodoLabel}
        </text>
      ) : null}
      {linha.marcador !== null ? (
        <text
          x={0}
          y={0}
          dy={28}
          textAnchor="middle"
          fill={linha.marcadorNegativo ? 'var(--color-negativo)' : 'var(--color-positivo)'}
          fontSize={11}
        >
          {linha.marcador}
        </text>
      ) : null}
    </g>
  );
}

function Legenda({ algumDeficit }: { algumDeficit: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      {ORDEM_PILHA_PROJECAO.map((serie) => (
        <span key={serie} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-[2px]"
            style={{ backgroundColor: CORES_PROJECAO[serie] }}
          />
          {LABEL_PROJECAO[serie]}
        </span>
      ))}
      {algumDeficit ? (
        <span className="text-recuperacao">
          Meses com déficit aparecem sem faixa azul — a verba livre é negativa.
        </span>
      ) : null}
    </div>
  );
}

/** Placeholder com a MESMA altura do gráfico, para não pular layout. */
function Esqueleto() {
  return <div className="h-72 w-full animate-pulse rounded-lg bg-surface-2" aria-hidden="true" />;
}

function useRechartsNoDesktop(): ModuloRecharts | null {
  const [modulo, setModulo] = useState<ModuloRecharts | null>(null);

  useEffect(() => {
    const consulta = window.matchMedia('(min-width: 1024px)');
    let cancelado = false;

    function carregar() {
      if (!consulta.matches) return;
      void import('recharts').then((mod) => {
        if (!cancelado) setModulo(mod);
      });
    }

    carregar();
    // Redimensionar para desktop também deve carregar (janela arrastada).
    consulta.addEventListener('change', carregar);
    return () => {
      cancelado = true;
      consulta.removeEventListener('change', carregar);
    };
  }, []);

  return modulo;
}

export function ProjecaoStackChart({ linhas }: { linhas: readonly LinhaProjecao[] }): ReactElement {
  const recharts = useRechartsNoDesktop();

  if (linhas.length === 0) {
    return (
      <p className="hidden py-10 text-center text-sm text-muted lg:block">
        Sem ciclos projetados para este horizonte.
      </p>
    );
  }

  const dados = linhas.map(prepararLinha);
  const algumDeficit = dados.some((linha) => linha.marcadorNegativo);
  const rarefazerRotulos = dados.length > 12;

  return (
    <figure className="hidden lg:block">
      <figcaption className="sr-only">
        Composição da renda prevista por ciclo. Cada coluna soma custos fixos, provisão,
        poupança-alvo, parcelas e verba livre; a verba livre é o segmento do topo. Os mesmos
        números estão na tabela mês a mês abaixo.
      </figcaption>

      <Legenda algumDeficit={algumDeficit} />

      <div className="mt-3 h-72 w-full">
        {recharts === null ? (
          <Esqueleto />
        ) : (
          <recharts.ResponsiveContainer width="100%" height="100%">
            <recharts.BarChart
              data={dados}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              barCategoryGap="20%"
              accessibilityLayer
            >
              <recharts.XAxis
                dataKey="periodoLabel"
                interval={0}
                height={44}
                stroke="var(--color-faint)"
                axisLine={{ stroke: 'var(--color-border)' }}
                tickLine={false}
                tick={(props: unknown) => (
                  <TickPeriodo props={props} linhas={dados} rarefazerRotulos={rarefazerRotulos} />
                )}
              />
              <recharts.YAxis
                tickFormatter={formatarEixoY}
                stroke="var(--color-faint)"
                tick={{ fill: 'var(--color-faint)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <recharts.Tooltip
                content={<ProjecaoTooltip />}
                cursor={{ fill: 'var(--color-surface-2)', opacity: 0.5 }}
              />
              {ORDEM_PILHA_PROJECAO.map((serie) => (
                <recharts.Bar
                  key={serie}
                  dataKey={CHAVE_DADO[serie]}
                  name={LABEL_PROJECAO[serie]}
                  stackId="composicao"
                  fill={CORES_PROJECAO[serie]}
                  maxBarSize={24}
                  // O "gap de 2px" entre segmentos é feito com traço na COR DA
                  // SURFACE — é vazio, não contorno: nenhuma tinta extra de dado.
                  stroke="var(--color-surface)"
                  strokeWidth={2}
                  isAnimationActive={false}
                  radius={serie === 'verbaLivre' ? [4, 4, 0, 0] : undefined}
                />
              ))}
            </recharts.BarChart>
          </recharts.ResponsiveContainer>
        )}
      </div>

      {/* O "nenhum parcelamento acaba neste horizonte" é da MANCHETE, não daqui.
          O gráfico chegou a emitir a própria versão, com "24 meses" fixo no
          texto — errado justamente para quem já está no horizonte de 24. A
          manchete sabe o horizonte real; duas frases na mesma tela era a
          duplicação que a integração dos três agentes expôs. */}
    </figure>
  );
}
