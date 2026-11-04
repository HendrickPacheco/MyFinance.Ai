/**
 * Compromissos (custo fixo e parcela) que vencem numa janela curta a partir de
 * hoje — a lista "Próximos 7 dias" da home. Rastreamento puro: nada aqui toca
 * verba ou teto. Comparação de data é lexicográfica ("YYYY-MM-DD").
 */
import { addDias, formatarDataCurta, type DataCivil } from '@/shared/data';

export interface CompromissoComData {
  id: string;
  nome: string;
  data: DataCivil;
  valorCents: number;
  pago: boolean;
}

export interface ParcelaComData extends CompromissoComData {
  parcelaAtual: number;
  numParcelas: number;
}

export interface ItemVencimento {
  tipo: 'FIXO' | 'PARCELA';
  /** `custoFixoId` (FIXO) ou `transacaoId` (PARCELA). */
  id: string;
  nome: string;
  data: DataCivil;
  /** '07/11' ou '08/11 · parcela 3/5'. */
  rotuloData: string;
  valorCents: number;
}

/** Não pagos com `hoje ≤ data ≤ hoje + (dias − 1)`, ordenados por data e nome. */
export function proximosVencimentos(params: {
  hoje: DataCivil;
  dias: number;
  fixos: readonly CompromissoComData[];
  parcelas: readonly ParcelaComData[];
}): ItemVencimento[] {
  const { hoje, dias } = params;
  const ate = addDias(hoje, dias - 1);
  const naJanela = (c: CompromissoComData) => !c.pago && hoje <= c.data && c.data <= ate;

  const itens: ItemVencimento[] = [
    ...params.fixos.filter(naJanela).map((f) => ({
      tipo: 'FIXO' as const,
      id: f.id,
      nome: f.nome,
      data: f.data,
      rotuloData: formatarDataCurta(f.data),
      valorCents: f.valorCents,
    })),
    ...params.parcelas.filter(naJanela).map((p) => ({
      tipo: 'PARCELA' as const,
      id: p.id,
      nome: p.nome,
      data: p.data,
      rotuloData: `${formatarDataCurta(p.data)} · parcela ${p.parcelaAtual}/${p.numParcelas}`,
      valorCents: p.valorCents,
    })),
  ];

  return itens.sort((a, b) => a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome, 'pt-BR'));
}
