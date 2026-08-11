/**
 * Título derivado da primeira pergunta de uma conversa do copiloto (Fase 2 da
 * persistência de conversas). Função PURA, sem I/O — decisão do dono é não
 * pagar nenhum token de IA só para nomear uma conversa.
 */

/** Título mostrado quando a primeira pergunta não sobra nada aproveitável. */
export const TITULO_CONVERSA_PADRAO = 'Nova conversa';

/** Comprimento máximo do título antes de truncar com reticências. */
const MAX_CARACTERES_TITULO = 60;

/**
 * Colapsa espaços internos (quebras de linha, tabs, espaços repetidos) num
 * único espaço — o texto vem de um `<textarea>` de usuário, que aceita
 * qualquer coisa.
 */
function colapsarEspacos(texto: string): string {
  return texto.trim().replace(/\s+/g, ' ');
}

/**
 * Deriva o título de uma conversa a partir da pergunta que a abriu.
 *
 * Trunca em `MAX_CARACTERES_TITULO`, com reticências marcando o corte, e cai
 * para `TITULO_CONVERSA_PADRAO` quando a pergunta é vazia ou só espaços — o
 * mesmo padrão de fallback que `PrismaConversaRepository.criar` já usa para
 * título vazio, para as duas fontes nunca divergirem visualmente.
 */
export function derivarTituloConversa(pergunta: string): string {
  const colapsado = colapsarEspacos(pergunta);
  if (colapsado === '') return TITULO_CONVERSA_PADRAO;
  if (colapsado.length <= MAX_CARACTERES_TITULO) return colapsado;

  return `${colapsado.slice(0, MAX_CARACTERES_TITULO).trimEnd()}…`;
}
