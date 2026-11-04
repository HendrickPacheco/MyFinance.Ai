/**
 * Renda líquida prevista (USD→BRL com imposto) e reaplicação de uma nova renda
 * ao ciclo congelado. Funções puras; dinheiro em centavos, câmbio em micros.
 */
import { converterParaBrlCents, formatBRL, formatTaxaBRL, formatUSD } from '@/shared/dinheiro';
import type { DataCivil } from '@/shared/data';
import type { Ciclo, Config, Cotacao } from '@/domain/model/entidades';
import type { MoedaRenda } from '@/domain/model/enums';

export interface RendaLiquida {
  moeda: MoedaRenda;
  liquidaCents: number;
  brutaOrigemCents: number | null;
  taxaMicros: number | null;
  dataCotacao: DataCivil | null;
  brutaBrlCents: number;
  impostoCents: number;
  decomposicao: string;
  motivoSemCotacao: string | null;
}

/** Imposto fixo OU percentual da bruta em BRL; os dois juntos é erro. */
export function calcularImpostoCents(p: {
  brutaBrlCents: number;
  impostoEstimadoCents: number | null;
  impostoEstimadoPercentual: number | null;
}): number {
  const { impostoEstimadoCents: fixo, impostoEstimadoPercentual: pct } = p;
  if (fixo != null && pct != null) {
    throw new RangeError('Informe imposto fixo OU percentual, não os dois');
  }
  if (fixo != null) return fixo;
  if (pct != null) return Math.floor((p.brutaBrlCents * pct) / 100);
  return 0;
}

export function rendaLiquidaPrevista(
  config: Pick<
    Config,
    | 'moedaRenda'
    | 'rendaBaseCents'
    | 'rendaBrutaMoedaOrigemCents'
    | 'impostoEstimadoCents'
    | 'impostoEstimadoPercentual'
  >,
  cotacao: Pick<Cotacao, 'data' | 'taxaMicros'> | null,
): RendaLiquida {
  const base = config.rendaBaseCents;
  const bruta = config.rendaBrutaMoedaOrigemCents;
  const semConversao = {
    moeda: config.moedaRenda,
    liquidaCents: base,
    brutaOrigemCents: null,
    taxaMicros: null,
    dataCotacao: null,
    brutaBrlCents: base,
    impostoCents: 0,
  };

  if (config.moedaRenda === 'BRL') {
    return {
      ...semConversao,
      decomposicao: `${formatBRL(base)} (renda líquida em reais)`,
      motivoSemCotacao: null,
    };
  }
  if (bruta == null) {
    return {
      ...semConversao,
      decomposicao: `${formatBRL(base)} (renda base; renda bruta em dólar não informada)`,
      motivoSemCotacao: 'Sem renda bruta em dólar informada; usando a renda base.',
    };
  }
  if (cotacao == null) {
    return {
      ...semConversao,
      brutaOrigemCents: bruta,
      decomposicao: `${formatBRL(base)} (renda base; sem cotação)`,
      motivoSemCotacao: 'Sem cotação do dólar disponível; usando a renda base em reais.',
    };
  }

  const brutaBrlCents = converterParaBrlCents(bruta, cotacao.taxaMicros);
  const impostoCents = calcularImpostoCents({ brutaBrlCents, ...config });
  const liquidaCents = brutaBrlCents - impostoCents;
  return {
    moeda: 'USD',
    liquidaCents,
    brutaOrigemCents: bruta,
    taxaMicros: cotacao.taxaMicros,
    dataCotacao: cotacao.data,
    brutaBrlCents,
    impostoCents,
    decomposicao:
      `${formatUSD(bruta)} × ${formatTaxaBRL(cotacao.taxaMicros)} = ${formatBRL(brutaBrlCents)}` +
      ` − imposto ${formatBRL(impostoCents)} = ${formatBRL(liquidaCents)}`,
    motivoSemCotacao: null,
  };
}

/**
 * Reaplica uma nova renda à verba congelada por DELTA, preservando rollover e
 * puxada da reserva já embutidos. A meta só muda se vier em percentual.
 */
export function aplicarNovaRendaAoCiclo(
  ciclo: Pick<
    Ciclo,
    'verbaVariavelCents' | 'rendaPrevistaCents' | 'rendaRealLiquidaCents' | 'poupancaAlvoCents'
  >,
  novaRendaCents: number,
  metaPoupancaPercent: number | null,
): { verbaVariavelCents: number; poupancaAlvoCents: number } {
  const anterior = ciclo.rendaRealLiquidaCents ?? ciclo.rendaPrevistaCents;
  return {
    verbaVariavelCents: ciclo.verbaVariavelCents + (novaRendaCents - anterior),
    poupancaAlvoCents:
      metaPoupancaPercent != null
        ? Math.floor((novaRendaCents * metaPoupancaPercent) / 100)
        : ciclo.poupancaAlvoCents,
  };
}
