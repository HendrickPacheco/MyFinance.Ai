import { describe, expect, it } from 'vitest';
import { atorDaRequisicao, FalhaLoginError, login, logout } from './auth';
import { criarDeps, ATOR_VIEWER } from './__fakes__/fakes-ciclo-fechamento';
import { ATOR_ANONIMO } from '@/domain/auth/ator';
import type { Usuario } from '@/domain/auth/usuario';

const DONO: Usuario = {
  id: 'u-owner',
  email: 'dono@exemplo.com',
  nome: 'Dono',
  senhaHash: 'fake$c2VuaGEtYm9hLWRvLWRvbm8=', // formato do FakeHashSenha (base64, sem a senha em claro)
  papel: 'OWNER',
  ativo: true,
};

function deps(usuarios: Usuario[] = [DONO]) {
  return criarDeps({ usuarios });
}

describe('login', () => {
  it('autentica com a senha correta e abre sessão', async () => {
    const d = deps();
    const ator = await login(d, { email: 'dono@exemplo.com', senha: 'senha-boa-do-dono' });

    expect(ator).toEqual({ id: 'u-owner', papel: 'OWNER' });
    expect(d.sessoes.criadas).toEqual(['u-owner']);
  });

  it('aceita email com capitalização e espaços diferentes', async () => {
    const d = deps();
    const ator = await login(d, { email: '  DONO@Exemplo.COM ', senha: 'senha-boa-do-dono' });
    expect(ator.id).toBe('u-owner');
  });

  it('rejeita a senha errada sem abrir sessão', async () => {
    const d = deps();
    await expect(login(d, { email: 'dono@exemplo.com', senha: 'errada' })).rejects.toThrow(
      FalhaLoginError,
    );
    expect(d.sessoes.criadas).toEqual([]);
  });

  it('dá a MESMA mensagem para email inexistente e senha errada', async () => {
    const d = deps();
    const semConta = await login(d, { email: 'ninguem@exemplo.com', senha: 'x' }).catch(
      (e: Error) => e.message,
    );
    const senhaErrada = await login(d, { email: 'dono@exemplo.com', senha: 'errada' }).catch(
      (e: Error) => e.message,
    );

    expect(semConta).toBe(senhaErrada);
    expect(semConta).toBe('Email ou senha inválidos.');
  });

  it('gasta um hash mesmo quando o email não existe (não vaza por timing)', async () => {
    const d = deps();
    await login(d, { email: 'ninguem@exemplo.com', senha: 'x' }).catch(() => undefined);
    expect(d.hashSenha.verificacoes).toBe(1);
  });

  it('recusa usuário desativado', async () => {
    const d = deps([{ ...DONO, ativo: false }]);
    await expect(
      login(d, { email: 'dono@exemplo.com', senha: 'senha-boa-do-dono' }),
    ).rejects.toThrow(FalhaLoginError);
    expect(d.sessoes.criadas).toEqual([]);
  });

  it('recusa usuário sem senha local (conta só-OAuth do caminho futuro)', async () => {
    const d = deps([{ ...DONO, senhaHash: null }]);
    await expect(login(d, { email: 'dono@exemplo.com', senha: 'qualquer' })).rejects.toThrow(
      FalhaLoginError,
    );
  });

  it('bloqueia na 6ª tentativa dentro da janela', async () => {
    const d = deps();
    const tentar = () =>
      login(d, { email: 'dono@exemplo.com', senha: 'errada', origem: '1.2.3.4' }).catch(
        (e: Error) => e.message,
      );

    for (let i = 0; i < 5; i += 1) {
      expect(await tentar()).toBe('Email ou senha inválidos.');
    }
    expect(await tentar()).toBe('Muitas tentativas. Tente novamente em alguns minutos.');
  });

  it('consulta o limite ANTES de verificar a senha (não vira amplificador de CPU)', async () => {
    const d = deps();
    for (let i = 0; i < 5; i += 1) {
      await login(d, { email: 'dono@exemplo.com', senha: 'errada', origem: '1.2.3.4' }).catch(
        () => undefined,
      );
    }
    const antes = d.hashSenha.verificacoes;

    await login(d, { email: 'dono@exemplo.com', senha: 'errada', origem: '1.2.3.4' }).catch(
      () => undefined,
    );

    expect(d.hashSenha.verificacoes).toBe(antes); // bloqueado sem hashear
  });

  it('separa a cota por origem — um IP travado não tranca o outro', async () => {
    const d = deps();
    for (let i = 0; i < 6; i += 1) {
      await login(d, { email: 'dono@exemplo.com', senha: 'errada', origem: 'ruim' }).catch(
        () => undefined,
      );
    }

    const ator = await login(d, {
      email: 'dono@exemplo.com',
      senha: 'senha-boa-do-dono',
      origem: 'boa',
    });
    expect(ator.papel).toBe('OWNER');
  });
});

describe('logout', () => {
  it('invalida a sessão corrente', async () => {
    const d = criarDeps({ sessaoAtual: ATOR_VIEWER });
    await logout(d);
    expect(d.sessoes.invalidacoes).toBe(1);
    expect(await d.sessoes.validar()).toBeNull();
  });
});

describe('atorDaRequisicao', () => {
  it('devolve o ator quando há sessão válida', async () => {
    const d = criarDeps({ sessaoAtual: ATOR_VIEWER });
    expect(await atorDaRequisicao(d)).toEqual(ATOR_VIEWER);
  });

  it('devolve o anônimo quando não há sessão', async () => {
    const d = criarDeps({ sessaoAtual: null });
    expect(await atorDaRequisicao(d)).toEqual(ATOR_ANONIMO);
  });
});
