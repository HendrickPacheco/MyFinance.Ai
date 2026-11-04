import type { Cotacao } from '@/domain/model/entidades';
import type { FonteCotacaoPort } from '@/domain/ports/cotacao';
import { ontem, type DataCivil } from '@/shared/data';

const BASE =
  'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)';

/** "YYYY-MM-DD" -> "MM-DD-YYYY" (formato do BCB), só string. */
const formatoBcb = (d: DataCivil) => `${d.slice(5, 7)}-${d.slice(8, 10)}-${d.slice(0, 4)}`;

/** PTAX de venda do BCB. Fim de semana/feriado volta `value: []` -> recua um dia. `timeoutMs` vale para a busca toda. Nunca lança. */
export class PtaxBcb implements FonteCotacaoPort {
  private readonly timeoutMs: number;
  private readonly diasParaTras: number;

  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    opcoes: { timeoutMs?: number; diasParaTras?: number } = {},
  ) {
    this.timeoutMs = opcoes.timeoutMs ?? 3000;
    this.diasParaTras = opcoes.diasParaTras ?? 7;
  }

  async buscarPtaxVenda(data: DataCivil): Promise<Cotacao | null> {
    try {
      // Orçamento TOTAL para o recuo inteiro: um BCB lento respondendo `[]` não pode
      // custar (diasParaTras + 1) × timeout numa renderização de página.
      const signal = AbortSignal.timeout(this.timeoutMs);
      let dia = data;
      for (let i = 0; i <= this.diasParaTras; i++) {
        const url = `${BASE}?@dataCotacao='${formatoBcb(dia)}'&$format=json`;
        const res = await this.fetchFn(url, { signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { value?: { cotacaoVenda?: unknown }[] };
        const venda = json.value?.[0]?.cotacaoVenda;
        if (typeof venda === 'number' && Number.isFinite(venda) && venda > 0) {
          return {
            data: dia,
            moedaOrigem: 'USD',
            moedaDestino: 'BRL',
            // Única conversão de float do sistema: na fronteira.
            taxaMicros: Math.round(venda * 1_000_000),
            fonte: 'PTAX_BCB',
          };
        }
        dia = ontem(dia);
      }
      return null;
    } catch (e) {
      console.warn('PTAX BCB indisponível:', e instanceof Error ? e.message : e);
      return null;
    }
  }
}
