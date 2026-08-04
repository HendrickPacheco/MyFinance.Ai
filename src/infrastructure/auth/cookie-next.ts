/**
 * `CookieStore` sobre `next/headers`. ÚNICO ponto do fluxo de sessão que
 * conhece o Next — o adapter de sessão (sessao-cookie.ts) permanece testável
 * com um store em memória.
 */
import { cookies } from 'next/headers';
import type { CookieStore, OpcoesCookie } from './sessao-cookie';

export async function cookieStoreDoNext(): Promise<CookieStore> {
  const store = await cookies();

  return {
    get(nome) {
      return store.get(nome)?.value;
    },
    set(nome, valor, opcoes: OpcoesCookie) {
      // Durante o render de uma página o Next proíbe escrever cookie e lança.
      // Quem chama (renovação deslizante) já trata; propagar mantém o
      // comportamento explícito para `criar`/`invalidar`, que rodam em action.
      store.set(nome, valor, opcoes);
    },
    delete(nome) {
      store.delete(nome);
    },
  };
}
