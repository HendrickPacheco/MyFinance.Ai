import type { Cotacao } from '@/domain/model/entidades';
import type { DataCivil } from '@/shared/data';

/** Cotação USD→BRL. GLOBAL (sem donoId, D4) — `salvar` é upsert pelo unique da data. */
export interface CotacaoRepository {
  obter(data: DataCivil): Promise<Cotacao | null>;
  ultimaAte(data: DataCivil): Promise<Cotacao | null>;
  salvar(c: Cotacao): Promise<Cotacao>;
}

/** Fonte externa (PTAX do BCB). `null` = não conseguiu; não deve lançar. */
export interface FonteCotacaoPort {
  buscarPtaxVenda(data: DataCivil): Promise<Cotacao | null>;
}
