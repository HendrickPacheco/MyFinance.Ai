/**
 * A projeção no celular. Substitui a coluna empilhada, que não existe abaixo de
 * 1024px (uma pilha de 5 séries × 24 meses a 375px é ilegível, e o Recharts nem
 * chega a ser baixado).
 *
 * MESMO ENCODING DO GRÁFICO, DE PROPÓSITO. A micro-barra de 6px usa
 * `CORES_PROJECAO` e `ORDEM_PILHA_PROJECAO` importados de `cores.ts` — nunca
 * cores redefinidas aqui — para que quem aprendeu a leitura no desktop não
 * precise reaprender no celular. O azul continua sendo a verba livre e continua
 * sendo a última faixa.
 *
 * VERBA LIVRE NEGATIVA NÃO ENTRA NA BARRA, pela mesma razão do gráfico: uma
 * largura negativa não existe. O clamp é de DESENHO — o valor real continua
 * escrito por extenso na linha, em `text-negativo`. E o denominador da barra é
 * a soma das faixas JÁ CLAMPADAS, não `totalComposicaoCents`: usar o total real
 * num mês de déficit faria as faixas somarem menos de 100% e deixarem um vão
 * cinza que ninguém saberia interpretar.
 *
 * Nenhum cálculo de domínio aqui: a única aritmética é a conversão de centavos
 * em porcentagem de largura, que é geometria de desenho.
 */
import { Badge } from '@/components/ui';
import {
  CORES_PROJECAO,
  LABEL_PROJECAO,
  ORDEM_PILHA_PROJECAO,
  type SerieProjecao,
} from '@/components/dashboard/cores';
import { formatBRL } from '@/shared/dinheiro';
import { cn } from '@/lib/cn';
import type { LinhaProjecao } from '@/application/projecao-view';

/** O valor REAL da série — inclusive verba livre negativa. */
function valorDaSerie(linha: LinhaProjecao, serie: SerieProjecao): number {
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

interface FaixaDesenhada {
  serie: SerieProjecao;
  larguraPercent: number;
  valorCents: number;
}

function faixasDaLinha(linha: LinhaProjecao): readonly FaixaDesenhada[] {
  const valores = ORDEM_PILHA_PROJECAO.map((serie) => ({
    serie,
    // Clamp de DESENHO (ver cabeçalho): largura negativa não existe.
    valorCents: Math.max(valorDaSerie(linha, serie), 0),
  }));
  const total = valores.reduce((soma, faixa) => soma + faixa.valorCents, 0);
  if (total <= 0) return [];

  return valores.map((faixa) => ({
    ...faixa,
    larguraPercent: (faixa.valorCents / total) * 100,
  }));
}

function MicroBarra({ linha }: { linha: LinhaProjecao }) {
  const faixas = faixasDaLinha(linha);
  if (faixas.length === 0) return null;

  return (
    <div
      // A leitura acessível da composição é a lista de valores logo abaixo —
      // a barra é redundância visual, não a única fonte.
      aria-hidden="true"
      className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
    >
      {faixas.map((faixa) => (
        <span
          key={faixa.serie}
          className="h-full"
          style={{
            width: `${String(faixa.larguraPercent)}%`,
            backgroundColor: CORES_PROJECAO[faixa.serie],
          }}
        />
      ))}
    </div>
  );
}

function ItemComposicao({ serie, valorCents }: { serie: SerieProjecao; valorCents: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-[2px]"
        style={{ backgroundColor: CORES_PROJECAO[serie] }}
      />
      <span className="text-muted">{LABEL_PROJECAO[serie]}</span>
      <span className="tnum ml-auto text-fg">{formatBRL(valorCents)}</span>
    </div>
  );
}

function LinhaMobile({ linha }: { linha: LinhaProjecao }) {
  const deficit = linha.verbaLivreCents < 0;
  const delta = linha.deltaVerbaLivreCents;

  return (
    <li className="px-4 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-medium text-fg">
          {linha.periodoLabel}
          {linha.abaixoDoPiso ? (
            <Badge tone="atencao" className="ml-2 align-middle">
              abaixo do piso
            </Badge>
          ) : null}
        </p>
        <p className="text-right">
          <span
            className={cn('tnum text-lg font-semibold', deficit ? 'text-negativo' : 'text-fg')}
          >
            {formatBRL(linha.verbaLivreCents)}
          </span>
          {delta !== null && delta !== 0 ? (
            <span
              className={cn('tnum ml-2 text-xs', delta > 0 ? 'text-positivo' : 'text-negativo')}
            >
              {delta > 0 ? `+${formatBRL(delta)}` : formatBRL(delta)}
            </span>
          ) : null}
        </p>
      </div>
      <p className="text-xs text-muted">
        verba livre · renda prevista {formatBRL(linha.rendaPrevistaCents)}
      </p>

      <MicroBarra linha={linha} />

      <div className="mt-3 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2 sm:gap-x-6">
        {ORDEM_PILHA_PROJECAO.map((serie) => (
          <ItemComposicao key={serie} serie={serie} valorCents={valorDaSerie(linha, serie)} />
        ))}
      </div>

      {linha.terminamNesteCiclo.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {linha.terminamNesteCiclo.map((fim) => (
            <Badge key={fim.parcelamentoId} tone="positivo">
              ⬆ {fim.descricao ?? 'Parcelamento sem descrição'} acaba · +
              {formatBRL(fim.valorMensalCents)}/mês
            </Badge>
          ))}
        </div>
      ) : null}
    </li>
  );
}

export function ProjecaoListaMobile({ linhas }: { linhas: readonly LinhaProjecao[] }) {
  if (linhas.length === 0) return null;

  return (
    <ul className="divide-y divide-border lg:hidden">
      {linhas.map((linha) => (
        <LinhaMobile key={linha.inicio} linha={linha} />
      ))}
    </ul>
  );
}
