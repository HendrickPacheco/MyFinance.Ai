/**
 * Guarda pura da memória do copiloto (Fase E, §11.2 do TASKS-IA.md).
 *
 * 🔴 O CORTE INVIOLÁVEL: **número nunca entra na memória.**
 *
 * O vector DB guarda intenção, plano e preferência. A conta continua saindo de
 * função pura via ferramenta. Embutir "verba de agosto: R$ 7.116,00" num
 * embedding cria alucinação plausível e INVISÍVEL — o número foi verdade
 * ontem e é falso hoje, e ninguém percebe. Uma memória não tem `cicloId`, não
 * tem data de validade e não é recalculada: ela é citada como se fosse hoje.
 *
 * Isso viola as travas 1 e 3 do CLAUDE.md de forma mais grave que um mock em
 * tela, porque um mock é obviamente falso e uma memória velha parece verdade.
 *
 * Por isso a rejeição acontece AQUI, numa função pura sem I/O, aplicada antes
 * de qualquer gravação e antes de qualquer embedding — nunca no prompt, que
 * não é testável e varia entre execuções.
 *
 * Se o dono disser "quero juntar R$ 50.000", guarda-se a META COMO INTENÇÃO
 * ("quero formar uma reserva de emergência"); o acompanhamento sai do motor.
 */

export const TIPOS_MEMORIA = ['PLANO', 'PREFERENCIA', 'CONTEXTO', 'CONVERSA'] as const;
export type TipoMemoria = (typeof TIPOS_MEMORIA)[number];

export const ORIGENS_MEMORIA = ['USUARIO', 'COPILOTO'] as const;
export type OrigemMemoria = (typeof ORIGENS_MEMORIA)[number];

/** Curto demais não é memória, é ruído — não tem o que buscar semanticamente. */
export const MIN_CARACTERES_MEMORIA = 8;
/**
 * Memória é uma frase, não um documento. O teto protege duas coisas: o custo
 * do embedding e a qualidade da busca — texto longo demais vira um vetor médio
 * que casa com tudo e não distingue nada.
 */
export const MAX_CARACTERES_MEMORIA = 500;

export type ResultadoValidacao =
  | { ok: true; texto: string }
  | { ok: false; motivo: string };

/**
 * Anos plausíveis passam como número solto: "quero trocar de carro em 2027" é
 * plano, não valor. Fora desta janela, um número de quatro dígitos ou mais é
 * tratado como dinheiro disfarçado.
 */
const ANO_MINIMO = 1900;
const ANO_MAXIMO = 2100;

/** Palavras que marcam um número como dinheiro, mesmo sem o símbolo. */
const PALAVRAS_DE_DINHEIRO =
  'reais?|real|conto|contos|pila|paus|mangos?|dinheiros?|BRL|R\\$';

/** Sufixos de magnitude que, num app financeiro, praticamente só medem dinheiro. */
const MAGNITUDES = 'mil|milh(?:ão|ao|ões|oes)|bilh(?:ão|ao|ões|oes)|k|kk|mi';

/**
 * As formas de escrever dinheiro que a guarda reconhece. Cada uma existe por
 * um caminho real de entrada:
 *
 *  1. símbolo/código ANTES do número, colado ou separado — "R$ 1.234,56",
 *     "R$50", "BRL 300";
 *  2. número seguido de palavra de dinheiro, com magnitude opcional no meio —
 *     "50 mil reais", "3000 reais", "2 milhões de reais";
 *  3. número com sufixo de magnitude sozinho — "50k", "50 mil", "3 mi";
 *  4. decimal no formato brasileiro com dois dígitos — "1.234,56", "47,90".
 */
const PADROES_MONETARIOS: readonly RegExp[] = [
  new RegExp('(?:R\\$|\\bBRL)\\s*\\d', 'i'),
  new RegExp(`\\d[\\d.,]*\\s*(?:${MAGNITUDES})?\\s*(?:de\\s+)?(?:${PALAVRAS_DE_DINHEIRO})\\b`, 'i'),
  new RegExp(`\\b\\d[\\d.,]*\\s*(?:${MAGNITUDES})\\b`, 'i'),
  new RegExp('\\b\\d{1,3}(?:\\.\\d{3})*,\\d{2}\\b'),
  new RegExp('\\b\\d+,\\d{2}\\b'),
];

/** Todo número inteiro do texto, sem os separadores, para a checagem de grandeza. */
const NUMERO_SOLTO = /\b\d[\d.]*\b/g;

/** Controle (incl. quebra de linha e tab) vira espaço antes de colapsar. */
// eslint-disable-next-line no-control-regex -- remover caractere de controle é o objetivo
const CARACTERES_DE_CONTROLE = /[\u0000-\u001F\u007F]/g;

/**
 * Normaliza o texto para gravação: colapsa espaço e quebra de linha, remove
 * caracteres de controle. Não mexe em acento nem em caixa — o embedding lida
 * bem com os dois, e destruir a grafia do dono piora a leitura na tela de
 * auditoria de memórias.
 */
export function normalizarTextoMemoria(bruto: string): string {
  return bruto
    .replace(CARACTERES_DE_CONTROLE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * `true` quando o texto contém algo que se comporta como valor monetário.
 * Exportada para a UI poder avisar ANTES de o usuário enviar, sem duplicar a
 * regra: a validação de verdade continua sendo `validarTextoMemoria`.
 */
export function contemValorMonetario(texto: string): boolean {
  if (PADROES_MONETARIOS.some((padrao) => padrao.test(texto))) return true;

  // Número grande e solto ("quero juntar 50000") não tem marcador nenhum, mas
  // num app de dinheiro é dinheiro. Ano plausível é a exceção deliberada.
  for (const bruto of texto.match(NUMERO_SOLTO) ?? []) {
    const numero = Number(bruto.replace(/\./g, ''));
    if (!Number.isFinite(numero) || numero < 1000) continue;
    const ehAnoPlausivel =
      /^\d{4}$/.test(bruto) && numero >= ANO_MINIMO && numero <= ANO_MAXIMO;
    if (!ehAnoPlausivel) return true;
  }

  return false;
}

/**
 * A porta de entrada da memória. Nenhuma gravação e nenhum embedding acontece
 * sem passar por aqui — é a §11.2 virando código executável.
 *
 * Devolve resultado em vez de lançar: o chamador mais importante é uma
 * ferramenta do copiloto, e ali toda falha precisa virar texto que o modelo
 * consegue narrar e corrigir, nunca exceção que mata o loop.
 */
export function validarTextoMemoria(bruto: string): ResultadoValidacao {
  const texto = normalizarTextoMemoria(bruto);

  if (texto.length < MIN_CARACTERES_MEMORIA) {
    return {
      ok: false,
      motivo: `Memória curta demais (mínimo ${MIN_CARACTERES_MEMORIA} caracteres).`,
    };
  }

  if (texto.length > MAX_CARACTERES_MEMORIA) {
    return {
      ok: false,
      motivo: `Memória longa demais (máximo ${MAX_CARACTERES_MEMORIA} caracteres). Guarde a intenção, não o detalhe.`,
    };
  }

  if (contemValorMonetario(texto)) {
    return {
      ok: false,
      motivo:
        'Memória não pode conter valor em dinheiro. O número de hoje é falso amanhã, e guardado num embedding ninguém percebe que envelheceu. ' +
        'Guarde a intenção ("quero formar uma reserva de emergência") — o valor sai do motor de cálculo quando for perguntado.',
    };
  }

  return { ok: true, texto };
}

export function ehTipoMemoria(valor: string): valor is TipoMemoria {
  return (TIPOS_MEMORIA as readonly string[]).includes(valor);
}
