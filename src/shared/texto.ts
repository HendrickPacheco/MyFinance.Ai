/**
 * Kernel de texto. Puro, sem domínio e sem framework.
 */

/**
 * Remove marcação markdown, deixando o conteúdo.
 *
 * Existe porque o copiloto responde em texto puro por instrução, mas modelos
 * escorregam para `**negrito**` por hábito — e a interface renderiza texto,
 * não markdown, então o asterisco apareceria cru na tela. É limpeza
 * defensiva, não renderização: quem destaca valor é o componente.
 *
 * Não toca em `*` solto no meio de palavra nem em `_` dentro de identificador
 * (`situacao_hoje` continua inteiro).
 */
export function semMarkdown(texto: string): string {
  return texto
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|[\s(])\*(\S|\S.*?\S)\*(?=[\s).,;:!?]|$)/g, '$1$2')
    .replace(/(^|[\s(])_(\S|\S.*?\S)_(?=[\s).,;:!?]|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ');
}
