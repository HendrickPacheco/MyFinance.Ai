'use client';

/**
 * Tooltip da coluna empilhada de `/projecao`.
 *
 * Lê de cima para baixo na MESMA ordem em que a pilha é desenhada (verba livre
 * no topo → custos fixos na base), para que o olho não precise reordenar nada
 * entre a figura e o texto. A identidade da série vem do ponto colorido ao lado
 * do rótulo; o texto sempre usa token de texto (`text-fg` / `text-muted`),
 * nunca a cor da série — amarelo e aqua são ilegíveis como texto na surface.
 */
import type { TooltipProps } from 'recharts';
import {
  CORES_PROJECAO,
  LABEL_PROJECAO,
  ORDEM_PILHA_PROJECAO,
  type SerieProjecao,
} from '@/components/dashboard/cores';
import { formatBRL } from '@/shared/dinheiro';
import type { LinhaProjecao } from '@/application/projecao-view';

/** Valor de cada série numa linha — indexado por identidade, não por posição. */
export function valorDaSerie(linha: LinhaProjecao, serie: SerieProjecao): number {
  switch (serie) {
    case 'fixos':
      return linha.fixosCents;
    case 'provisao':
      return linha.provisaoMensalCents;
    case 'poupanca':
      return linha.poupancaAlvoCents;
    case 'parcelas':
      return linha.parcelasComprometidasCents;
    case 'verbaLivre':
      return linha.verbaLivreCents;
  }
}

/** "+R$ 458,00" / "−R$ 458,00" (menos tipográfico, não hífen). */
export function formatarSinalizado(cents: number): string {
  const sinal = cents < 0 ? '−' : '+';
  return `${sinal}${formatBRL(Math.abs(cents))}`;
}

function ehLinhaProjecao(valor: unknown): valor is LinhaProjecao {
  if (typeof valor !== 'object' || valor === null) return false;
  const candidato = valor as Record<string, unknown>;
  return (
    typeof candidato.periodoLabel === 'string' &&
    typeof candidato.verbaLivreCents === 'number' &&
    typeof candidato.rendaPrevistaCents === 'number' &&
    Array.isArray(candidato.terminamNesteCiclo)
  );
}

function LinhaValor({
  cor,
  rotulo,
  valorCents,
  destaque,
  tomNegativo,
}: {
  cor: string;
  rotulo: string;
  valorCents: number;
  destaque?: boolean;
  tomNegativo?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: cor }}
      />
      <span className={destaque === true ? 'text-fg' : 'text-muted'}>{rotulo}</span>
      <span
        className={[
          'tnum ml-auto',
          tomNegativo === true
            ? 'text-recuperacao'
            : destaque === true
              ? 'font-medium text-fg'
              : 'text-muted',
        ].join(' ')}
      >
        {formatBRL(valorCents)}
      </span>
    </div>
  );
}

export function ProjecaoTooltip({ active, payload }: TooltipProps<number, string>) {
  if (active !== true || payload === undefined || payload.length === 0) return null;

  const bruto: unknown = payload[0]?.payload;
  if (!ehLinhaProjecao(bruto)) return null;
  const linha = bruto;

  const deficit = linha.verbaLivreCents < 0;
  // Ordem de leitura = ordem visual da pilha, de cima para baixo.
  const seriesDeCimaParaBaixo = [...ORDEM_PILHA_PROJECAO].reverse();

  return (
    <div className="min-w-[15rem] rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-sm shadow-lg">
      <p className="flex items-baseline justify-between gap-4">
        <span className="font-medium text-fg">{linha.periodoLabel}</span>
        {/* O número da direita é a ALTURA da coluna (`totalComposicaoCents`),
            não a renda: com rollover ou depois de `puxarDaReserva` a soma das
            cinco faixas foge da renda prevista, e um total que não fecha com o
            desenho ao lado seria pior que nenhum total. */}
        <span className="tnum text-xs text-faint">
          total {formatBRL(linha.totalComposicaoCents)}
        </span>
      </p>

      <div className="mt-2 space-y-1">
        {seriesDeCimaParaBaixo.map((serie) => (
          <LinhaValor
            key={serie}
            cor={CORES_PROJECAO[serie]}
            rotulo={LABEL_PROJECAO[serie]}
            valorCents={valorDaSerie(linha, serie)}
            destaque={serie === 'verbaLivre'}
            tomNegativo={serie === 'verbaLivre' && deficit}
          />
        ))}
      </div>

      {linha.totalComposicaoCents !== linha.rendaPrevistaCents ? (
        <p className="tnum mt-2 text-xs text-faint">
          Renda prevista {formatBRL(linha.rendaPrevistaCents)} — a diferença é rollover.
        </p>
      ) : null}

      {deficit ? (
        <p className="mt-2 border-t border-border pt-2 text-xs text-recuperacao">
          Os compromissos passam da renda em {formatBRL(Math.abs(linha.verbaLivreCents))}. A coluna
          mostra a verba livre como zero — não existe barra negativa.
        </p>
      ) : null}

      {linha.abaixoDoPiso && !deficit ? (
        <p className="mt-2 border-t border-border pt-2 text-xs text-atencao">
          A verba livre diária fica abaixo do piso neste ciclo.
        </p>
      ) : null}

      {linha.deltaVerbaLivreCents !== null && linha.deltaVerbaLivreCents !== 0 ? (
        <p className="tnum mt-2 text-xs text-muted">
          {formatarSinalizado(linha.deltaVerbaLivreCents)} de verba livre em relação ao ciclo
          anterior.
        </p>
      ) : null}

      {linha.terminamNesteCiclo.length > 0 ? (
        <ul className="mt-2 space-y-0.5 border-t border-border pt-2 text-xs text-positivo">
          {linha.terminamNesteCiclo.map((fim) => (
            <li key={fim.parcelamentoId} className="tnum">
              ⬆ {fim.descricao ?? 'Parcelamento'} acaba ·{' '}
              {formatarSinalizado(fim.valorMensalCents)}/mês
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
