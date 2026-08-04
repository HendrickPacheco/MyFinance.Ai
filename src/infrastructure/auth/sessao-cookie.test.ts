import { beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { NOME_COOKIE_SESSAO, SessaoCookie, type CookieStore } from './sessao-cookie';
import type { RelogioPort } from '@/domain/ports/relogio';
import type { Usuario } from '@/domain/auth/usuario';
import type {
  RegistroSessao,
  SessaoRepository,
  UsuarioRepository,
} from '@/domain/ports/usuarios';
import type { DataCivil } from '@/shared/data';

const DIA_MS = 24 * 60 * 60 * 1000;

/** Relógio controlável — nenhum teste depende do relógio de parede. */
class RelogioControlado implements RelogioPort {
  constructor(private instante: Date) {}
  hoje(): DataCivil {
    return this.instante.toISOString().slice(0, 10) as DataCivil;
  }
  agora(): Date {
    return this.instante;
  }
  avancarDias(dias: number): void {
    this.instante = new Date(this.instante.getTime() + dias * DIA_MS);
  }
}

class SessaoMemoria implements SessaoRepository {
  linhas = new Map<string, RegistroSessao>();

  async criar(r: RegistroSessao) {
    this.linhas.set(r.id, { ...r });
  }
  async porId(id: string) {
    const r = this.linhas.get(id);
    return r ? { ...r } : null;
  }
  async estender(id: string, expiraEm: Date) {
    const r = this.linhas.get(id);
    if (r) r.expiraEm = expiraEm;
  }
  async excluir(id: string) {
    this.linhas.delete(id);
  }
  async excluirExpiradas(agora: Date) {
    for (const [id, r] of this.linhas) {
      if (r.expiraEm <= agora) this.linhas.delete(id);
    }
  }
}

class UsuariosMemoria implements UsuarioRepository {
  constructor(public usuarios: Usuario[]) {}
  async porEmail(email: string) {
    return this.usuarios.find((u) => u.email === email) ?? null;
  }
  async porId(id: string) {
    return this.usuarios.find((u) => u.id === id) ?? null;
  }
  async criar(): Promise<Usuario> {
    throw new Error('não usado neste teste');
  }
}

class CookiesMemoria implements CookieStore {
  valores = new Map<string, string>();
  ultimaExpiracao: Date | null = null;
  bloquearEscrita = false;

  get(nome: string) {
    return this.valores.get(nome);
  }
  set(nome: string, valor: string, opcoes: { expires: Date }) {
    if (this.bloquearEscrita) throw new Error('Cookies can only be modified in a Server Action');
    this.valores.set(nome, valor);
    this.ultimaExpiracao = opcoes.expires;
  }
  delete(nome: string) {
    this.valores.delete(nome);
  }
}

const DONO: Usuario = {
  id: 'u-owner',
  email: 'dono@exemplo.com',
  nome: null,
  senhaHash: 'irrelevante',
  papel: 'OWNER',
  ativo: true,
};

let sessoes: SessaoMemoria;
let usuarios: UsuariosMemoria;
let cookies: CookiesMemoria;
let relogio: RelogioControlado;
let sessao: SessaoCookie;

beforeEach(() => {
  sessoes = new SessaoMemoria();
  usuarios = new UsuariosMemoria([{ ...DONO }]);
  cookies = new CookiesMemoria();
  relogio = new RelogioControlado(new Date('2026-08-04T12:00:00Z'));
  sessao = new SessaoCookie(sessoes, usuarios, relogio, cookies);
});

describe('criar', () => {
  it('grava o HASH do token, nunca o token cru', async () => {
    await sessao.criar('u-owner');

    const token = cookies.get(NOME_COOKIE_SESSAO);
    expect(token).toBeTruthy();

    const idsGravados = [...sessoes.linhas.keys()];
    expect(idsGravados).toHaveLength(1);
    // O que está no banco não é o que está no cookie...
    expect(idsGravados[0]).not.toBe(token);
    // ...é exatamente o SHA-256 dele.
    expect(idsGravados[0]).toBe(createHash('sha256').update(token!).digest('hex'));
  });

  it('gera token novo a cada sessão', async () => {
    await sessao.criar('u-owner');
    const primeiro = cookies.get(NOME_COOKIE_SESSAO);
    await sessao.criar('u-owner');
    expect(cookies.get(NOME_COOKIE_SESSAO)).not.toBe(primeiro);
  });

  it('define expiração no futuro', async () => {
    const { expiraEm } = await sessao.criar('u-owner');
    expect(expiraEm.getTime()).toBeGreaterThan(relogio.agora().getTime());
    expect(cookies.ultimaExpiracao).toEqual(expiraEm);
  });
});

describe('validar', () => {
  it('devolve o ator da sessão válida', async () => {
    await sessao.criar('u-owner');
    expect(await sessao.validar()).toEqual({ id: 'u-owner', papel: 'OWNER' });
  });

  it('devolve null sem cookie', async () => {
    expect(await sessao.validar()).toBeNull();
  });

  it('devolve null para token que não existe no banco (cookie forjado)', async () => {
    cookies.valores.set(NOME_COOKIE_SESSAO, 'token-inventado');
    expect(await sessao.validar()).toBeNull();
  });

  it('rejeita e limpa sessão expirada', async () => {
    await sessao.criar('u-owner');
    relogio.avancarDias(31);

    expect(await sessao.validar()).toBeNull();
    expect(sessoes.linhas.size).toBe(0); // limpou o lixo
  });

  it('rejeita sessão de usuário desativado — revogação tem efeito imediato', async () => {
    await sessao.criar('u-owner');
    usuarios.usuarios[0]!.ativo = false;

    expect(await sessao.validar()).toBeNull();
    expect(sessoes.linhas.size).toBe(0);
  });

  it('rejeita sessão de usuário apagado', async () => {
    await sessao.criar('u-owner');
    usuarios.usuarios = [];
    expect(await sessao.validar()).toBeNull();
  });

  it('reflete a mudança de papel no banco sem exigir novo login', async () => {
    await sessao.criar('u-owner');
    usuarios.usuarios[0]!.papel = 'VIEWER';
    expect(await sessao.validar()).toEqual({ id: 'u-owner', papel: 'VIEWER' });
  });

  it('NÃO renova enquanto falta muito para expirar', async () => {
    await sessao.criar('u-owner');
    const original = [...sessoes.linhas.values()][0]!.expiraEm;

    relogio.avancarDias(1);
    await sessao.validar();

    expect([...sessoes.linhas.values()][0]!.expiraEm).toEqual(original);
  });

  it('renova quando entra no limiar (renovação deslizante)', async () => {
    await sessao.criar('u-owner');
    const original = [...sessoes.linhas.values()][0]!.expiraEm;

    relogio.avancarDias(25); // faltam 5 dias de uma janela de 30
    await sessao.validar();

    expect([...sessoes.linhas.values()][0]!.expiraEm.getTime()).toBeGreaterThan(
      original.getTime(),
    );
  });

  it('renova no banco mesmo quando o cookie não pode ser escrito (render de página)', async () => {
    await sessao.criar('u-owner');
    const original = [...sessoes.linhas.values()][0]!.expiraEm;

    relogio.avancarDias(25);
    cookies.bloquearEscrita = true; // o Next proíbe set() durante o render

    // Não pode derrubar a requisição...
    await expect(sessao.validar()).resolves.toEqual({ id: 'u-owner', papel: 'OWNER' });
    // ...e a renovação no banco aconteceu assim mesmo.
    expect([...sessoes.linhas.values()][0]!.expiraEm.getTime()).toBeGreaterThan(
      original.getTime(),
    );
  });
});

describe('invalidar', () => {
  it('apaga a linha e o cookie — revogação instantânea', async () => {
    await sessao.criar('u-owner');
    await sessao.invalidar();

    expect(sessoes.linhas.size).toBe(0);
    expect(cookies.get(NOME_COOKIE_SESSAO)).toBeUndefined();
    expect(await sessao.validar()).toBeNull();
  });

  it('não explode em logout sem sessão', async () => {
    await expect(sessao.invalidar()).resolves.toBeUndefined();
  });
});
