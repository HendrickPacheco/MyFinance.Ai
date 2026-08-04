/**
 * Adapter de sessão: token opaco + hash no banco + cookie httpOnly.
 *
 * Padrão consolidado (estilo oslo/Lucia), implementado com primitivos do Node —
 * sem depender da lib Lucia, que está descontinuada (TASKS-AUTH §2.1).
 *
 * A regra que importa: o cookie carrega o TOKEN CRU; o banco guarda apenas o
 * SHA-256 dele como `Sessao.id`. Quem ler o banco (dump, backup, acesso ao
 * Postgres) não consegue forjar uma sessão — só vê hashes.
 *
 * SHA-256 sem sal é adequado AQUI, e só aqui: o token tem 256 bits de entropia
 * de CSPRNG, então não há espaço de busca para força bruta ou rainbow table. É
 * o oposto do caso da senha humana, que exige Argon2id (argon2.ts).
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Ator } from '@/domain/auth/ator';
import type { RelogioPort } from '@/domain/ports/relogio';
import type { SessaoPort } from '@/domain/ports/sessao';
import type { SessaoRepository, UsuarioRepository } from '@/domain/ports/usuarios';

export const NOME_COOKIE_SESSAO = 'sessao';

/** Duração da sessão e limiar da renovação deslizante. */
const DURACAO_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
/**
 * Só renova quando falta menos de 1/3 da janela (10 dias). Renovar a cada
 * request geraria um UPDATE por página carregada, sem ganho nenhum para o
 * usuário.
 */
const LIMIAR_RENOVACAO_MS = DURACAO_MS / 3;

/**
 * Acesso ao cookie, isolado numa interface para que o adapter seja testável
 * sem `next/headers` (que só funciona dentro do ciclo de request do Next).
 */
export interface CookieStore {
  get(nome: string): string | undefined;
  set(nome: string, valor: string, opcoes: OpcoesCookie): void;
  delete(nome: string): void;
}

export interface OpcoesCookie {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  expires: Date;
}

function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class SessaoCookie implements SessaoPort {
  constructor(
    private readonly sessoes: SessaoRepository,
    private readonly usuarios: UsuarioRepository,
    private readonly relogio: RelogioPort,
    private readonly cookies: CookieStore,
  ) {}

  async criar(usuarioId: string): Promise<{ expiraEm: Date }> {
    // 32 bytes de CSPRNG. `randomBytes` (não `Math.random`) é o ponto inteiro.
    const token = randomBytes(32).toString('base64url');
    const expiraEm = new Date(this.relogio.agora().getTime() + DURACAO_MS);

    await this.sessoes.criar({ id: hashDoToken(token), usuarioId, expiraEm });

    this.cookies.set(NOME_COOKIE_SESSAO, token, {
      httpOnly: true, // JS da página não lê — nem o nosso, nem o de um XSS
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // navegação normal funciona; POST cross-site não manda o cookie
      path: '/',
      expires: expiraEm,
    });

    return { expiraEm };
  }

  async validar(): Promise<Ator | null> {
    const token = this.cookies.get(NOME_COOKIE_SESSAO);
    if (!token) return null;

    const id = hashDoToken(token);
    const registro = await this.sessoes.porId(id);
    if (!registro) return null;

    const agora = this.relogio.agora();
    if (registro.expiraEm.getTime() <= agora.getTime()) {
      // Sessão vencida é tratada como ausente — e limpa, para a tabela não
      // acumular lixo.
      await this.sessoes.excluir(id);
      return null;
    }

    const usuario = await this.usuarios.porId(registro.usuarioId);
    // Usuário apagado ou desativado invalida a sessão na hora: é assim que
    // "desligar o acesso de alguém" tem efeito imediato, sem esperar expirar.
    if (!usuario || !usuario.ativo) {
      await this.sessoes.excluir(id);
      return null;
    }

    await this.renovarSePerto(id, registro.expiraEm, agora, token);

    return { id: usuario.id, papel: usuario.papel };
  }

  async invalidar(): Promise<void> {
    const token = this.cookies.get(NOME_COOKIE_SESSAO);
    if (token) {
      // DELETE na linha = revogação instantânea. É a vantagem concreta da
      // sessão opaca sobre JWT, que continuaria válido até expirar.
      await this.sessoes.excluir(hashDoToken(token));
    }
    this.cookies.delete(NOME_COOKIE_SESSAO);
  }

  private async renovarSePerto(
    id: string,
    expiraEm: Date,
    agora: Date,
    token: string,
  ): Promise<void> {
    if (expiraEm.getTime() - agora.getTime() >= LIMIAR_RENOVACAO_MS) return;

    const nova = new Date(agora.getTime() + DURACAO_MS);
    await this.sessoes.estender(id, nova);
    try {
      this.cookies.set(NOME_COOKIE_SESSAO, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        expires: nova,
      });
    } catch {
      // `validar()` também roda durante o render de uma página, onde o Next
      // proíbe escrever cookie. A renovação no banco já aconteceu; o cookie
      // pega a data nova na próxima server action. Falhar aqui não pode
      // derrubar a requisição.
    }
  }
}

/**
 * Comparação em tempo constante para tokens de mesmo tamanho. Exportada para
 * uso futuro (ex.: tokens de convite); a validação de sessão acima compara por
 * lookup de hash no banco, que não expõe timing útil.
 */
export function comparaSegura(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
