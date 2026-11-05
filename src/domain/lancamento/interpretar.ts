import type { MetodoPagamento, TipoVerba } from '@/domain/model/enums';

export interface CategoriaRef {
  id: string;
  nome: string;
}

export type LancamentoInterpretado =
  | {
      ok: true;
      valorCents: number;
      descricao: string | null;
      metodo: MetodoPagamento | null;
      categoriaId: string | null;
      /** 'EXTRA' com a palavra "extra(s)"; null = padrão da categoria. */
      tipoVerba: TipoVerba | null;
    }
  | { ok: false; erro: string };

const METODOS: Record<string, MetodoPagamento> = {
  credito: 'CREDITO',
  cartao: 'CREDITO',
  debito: 'DEBITO',
  pix: 'PIX',
  dinheiro: 'DINHEIRO',
  especie: 'DINHEIRO',
};

const semAcento = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** "1.234,56" | "80,50" | "80.50" | "80" → centavos; null se não for número. */
function parseValor(token: string): number | null {
  let t = token.replace(/^r\$/i, '');
  if (!/^\d[\d.,]*$/.test(t)) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (!/^\d+\.\d{1,2}$/.test(t)) t = t.replace(/\./g, ''); // milhar ("1.234"); "80.50" fica decimal
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Interpreta "80 mercado pix extra" em valor, método, categoria, verba e descrição. */
export function interpretarLancamentoRapido(
  texto: string,
  categorias: CategoriaRef[],
): LancamentoInterpretado {
  // "R$ 80" → "R$80" para virar um único token
  const tokens = texto.trim().replace(/r\$\s+/i, 'R$').split(/\s+/).filter(Boolean);

  let valorCents: number | null = null;
  const resto: string[] = [];
  for (const tk of tokens) {
    const v: number | null = valorCents === null ? parseValor(tk) : null;
    if (v !== null) valorCents = v;
    else resto.push(tk);
  }
  if (valorCents === null || valorCents <= 0) return { ok: false, erro: 'Informe um valor.' };

  let tipoVerba: TipoVerba | null = null;
  let metodo: MetodoPagamento | null = null;
  const semMetodo = resto.filter((tk) => {
    if (/^extras?$/.test(semAcento(tk))) {
      tipoVerba = 'EXTRA';
      return false;
    }
    const m = METODOS[semAcento(tk)];
    if (m && !metodo) {
      metodo = m;
      return false;
    }
    return true;
  });

  const cats = categorias.map((c) => ({ id: c.id, nome: semAcento(c.nome) }));
  let categoriaId: string | null = null;
  for (const tk of semMetodo) {
    const n = semAcento(tk);
    if (n.length < 3) continue;
    const c = cats.find((x) => x.nome.startsWith(n));
    if (c) {
      categoriaId = c.id;
      break;
    }
  }

  return {
    ok: true,
    valorCents,
    descricao: semMetodo.join(' ') || null,
    metodo,
    categoriaId,
    tipoVerba,
  };
}
