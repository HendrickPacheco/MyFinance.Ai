/**
 * Congelado do ciclo vs. cadastro de hoje — o mesmo padrão de divergência que
 * vale para custo fixo (regra 3) e para provisão mensal: o bloco de topo
 * mostra o valor CONGELADO quando o ciclo nasceu, o detalhamento mostra o
 * cadastro de HOJE, e os dois legitimamente divergem sempre que algo foi
 * criado, alterado ou desativado depois da abertura do ciclo (D-13/D-14).
 */
import { assertCentavos } from '@/shared/dinheiro';

export type TipoCongelado = 'CUSTO_FIXO' | 'PROVISAO';

export interface DivergenciaCongelado {
  congeladoNoCicloCents: number;
  cadastradoHojeCents: number;
  /** `cadastradoHoje − congeladoNoCiclo`. Zero = cadastro intacto desde a abertura. */
  diferencaCents: number;
  /** Texto do PORQUÊ (D-14). `null` só quando `diferencaCents === 0`. */
  motivoDiferenca: string | null;
}

const MOTIVO_CUSTOS_FIXOS_DIVERGENTES =
  'O bloco vale o valor CONGELADO quando o ciclo nasceu (regra 3); o detalhamento por ' +
  'categoria vale o cadastro de hoje. A diferença é custo fixo criado, alterado ou ' +
  'desativado no meio do ciclo — o ciclo em curso não é recalculado por isso, a não ser ' +
  'por uma ação explícita de recalcular.';

const MOTIVO_PROVISAO_DIVERGENTE =
  'O bloco vale o valor CONGELADO quando o ciclo nasceu (regra 3); o detalhamento por ' +
  'provisão vale o cadastro de hoje. A diferença é provisão anual criada, alterada ou ' +
  'desativada no meio do ciclo — o ciclo em curso não é recalculado por isso, a não ser ' +
  'por uma ação explícita de recalcular.';

const MOTIVO_POR_TIPO: Record<TipoCongelado, string> = {
  CUSTO_FIXO: MOTIVO_CUSTOS_FIXOS_DIVERGENTES,
  PROVISAO: MOTIVO_PROVISAO_DIVERGENTE,
};

export function divergenciaCongelado(
  congeladoNoCicloCents: number,
  cadastradoHojeCents: number,
  tipo: TipoCongelado,
): DivergenciaCongelado {
  assertCentavos(congeladoNoCicloCents, 'congeladoNoCicloCents');
  assertCentavos(cadastradoHojeCents, 'cadastradoHojeCents');
  const diferencaCents = cadastradoHojeCents - congeladoNoCicloCents;

  return {
    congeladoNoCicloCents,
    cadastradoHojeCents,
    diferencaCents,
    motivoDiferenca: diferencaCents === 0 ? null : MOTIVO_POR_TIPO[tipo],
  };
}
