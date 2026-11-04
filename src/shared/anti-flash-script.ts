/**
 * Script inline anti-flash da sidebar.
 *
 * Também aplica o tema (`financial:tema`: 'dark'|'light', padrão claro).
 *
 * Mora aqui, e não solto no `app/layout.tsx`, para manter o conteúdo em um
 * lugar só. A CSP o autoriza pelo `nonce` da requisição (ver `middleware.ts`),
 * NUNCA por `unsafe-inline` — que anularia a diretiva inteira.
 *
 * Conteúdo é constante do desenvolvedor: NUNCA interpole dado de usuário aqui.
 */
export const SIDEBAR_ANTI_FLASH_SCRIPT = `
(function () {
  try {
    var t = window.localStorage.getItem('financial:tema');
    document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
  try {
    var v = window.localStorage.getItem('financial:sidebar-collapsed');
    document.documentElement.setAttribute('data-sidebar', v === '1' ? 'collapsed' : 'expanded');
  } catch (e) {
    // localStorage indisponível (modo privado, etc.) — mantém expandida.
  }
})();
`;
