import { describe, expect, it } from 'vitest';
import {
  cadastrar,
  cadastroHabilitado,
  CadastroDesabilitadoError,
  CadastroInvalidoError,
  TAMANHO_MINIMO_SENHA,
} from './cadastro';
import { criarDeps } from './__fakes__/fakes-ciclo-fechamento';
import type { Usuario } from '@/domain/auth/usuario';

const CODIGO = 'convite-secreto-do-dono';
const SENHA_BOA = 'uma-frase-longa-de-senha';

const EXISTENTE: Usuario = {
  id: 'u-existente',
  email: 'ocupado@exemplo.com',
  nome: null,
  senhaHash: 'fake$aXJyZWxldmFudGU=', // formato do FakeHashSenha
  papel: 'OWNER',
  ativo: true,
};

function entrada(patch: Partial<Parameters<typeof cadastrar>[1]> = {}) {
  return { email: 'novo@exemplo.com', senha: SENHA_BOA, codigo: CODIGO, ...patch };
}

describe('cadastroHabilitado', () => {
  it('desliga quando não há código configurado', () => {
    expect(cadastroHabilitado(undefined)).toBe(false);
    expect(cadastroHabilitado('')).toBe(false);
  });

  it('liga quando há código', () => {
    expect(cadastroHabilitado(CODIGO)).toBe(true);
  });
});

describe('cadastrar — falha fechada', () => {
  it('recusa quando o cadastro está desabilitado, mesmo com dados válidos', async () => {
    const d = criarDeps();
    await expect(cadastrar(d, entrada(), undefined)).rejects.toBeInstanceOf(
      CadastroDesabilitadoError,
    );
    expect(d.usuarios.criados).toEqual([]);
  });

  it('não gasta hash nem consulta nada quando está desabilitado', async () => {
    const d = criarDeps();
    await cadastrar(d, entrada(), undefined).catch(() => undefined);
    expect(d.rateLimiter.chamadas).toEqual([]);
  });
});

describe('cadastrar — código de convite', () => {
  it('recusa código errado', async () => {
    const d = criarDeps();
    await expect(cadastrar(d, entrada({ codigo: 'chute' }), CODIGO)).rejects.toBeInstanceOf(
      CadastroInvalidoError,
    );
    expect(d.usuarios.criados).toEqual([]);
  });

  it('recusa código com prefixo correto — não vaza progresso parcial', async () => {
    const d = criarDeps();
    await expect(
      cadastrar(d, entrada({ codigo: CODIGO.slice(0, -1) }), CODIGO),
    ).rejects.toBeInstanceOf(CadastroInvalidoError);
  });

  it('aceita o código correto', async () => {
    const d = criarDeps();
    const ator = await cadastrar(d, entrada(), CODIGO);
    expect(ator.id).toBeTruthy();
  });
});

describe('cadastrar — validação', () => {
  it('recusa senha abaixo do mínimo', async () => {
    const d = criarDeps();
    const curta = 'x'.repeat(TAMANHO_MINIMO_SENHA - 1);
    await expect(cadastrar(d, entrada({ senha: curta }), CODIGO)).rejects.toThrow(
      /ao menos 12 caracteres/,
    );
    expect(d.usuarios.criados).toEqual([]);
  });

  it('recusa email sem @', async () => {
    const d = criarDeps();
    await expect(cadastrar(d, entrada({ email: 'nao-e-email' }), CODIGO)).rejects.toThrow(
      /Email inválido/,
    );
  });

  it('recusa email já cadastrado e não cria nada', async () => {
    const d = criarDeps({ usuarios: [EXISTENTE] });
    await expect(
      cadastrar(d, entrada({ email: 'ocupado@exemplo.com' }), CODIGO),
    ).rejects.toThrow(/já tem conta/);
    expect(d.usuarios.criados).toEqual([]);
  });

  it('normaliza o email (maiúsculas e espaços)', async () => {
    const d = criarDeps();
    await cadastrar(d, entrada({ email: '  NOVO@Exemplo.COM ' }), CODIGO);
    expect(d.usuarios.criados[0]?.email).toBe('novo@exemplo.com');
  });
});

describe('cadastrar — o que o usuário novo recebe', () => {
  it('nasce OWNER, dono do próprio workspace', async () => {
    const d = criarDeps();
    const ator = await cadastrar(d, entrada(), CODIGO);
    expect(ator.papel).toBe('OWNER');
    expect(d.usuarios.criados[0]?.papel).toBe('OWNER');
  });

  it('nunca guarda a senha em claro', async () => {
    const d = criarDeps();
    await cadastrar(d, entrada(), CODIGO);
    const hash = d.usuarios.criados[0]?.senhaHash ?? '';
    expect(hash).not.toBe(SENHA_BOA);
    expect(hash).not.toContain(SENHA_BOA);
  });

  it('já sai logado (sessão aberta)', async () => {
    const d = criarDeps();
    const ator = await cadastrar(d, entrada(), CODIGO);
    expect(d.sessoes.criadas).toEqual([ator.id]);
  });

  it('guarda o nome quando informado, e null quando vazio', async () => {
    const comNome = criarDeps();
    await cadastrar(comNome, entrada({ nome: '  Maria  ' }), CODIGO);
    expect(comNome.usuarios.criados[0]?.nome).toBe('Maria');

    const semNome = criarDeps();
    await cadastrar(semNome, entrada({ nome: '   ' }), CODIGO);
    expect(semNome.usuarios.criados[0]?.nome).toBeNull();
  });
});

describe('cadastrar — rate limit', () => {
  it('bloqueia a partir do 4º cadastro da mesma origem', async () => {
    const d = criarDeps();
    for (let i = 0; i < 3; i += 1) {
      await cadastrar(d, entrada({ email: `novo${i}@exemplo.com`, origem: '1.2.3.4' }), CODIGO);
    }

    await expect(
      cadastrar(d, entrada({ email: 'novo4@exemplo.com', origem: '1.2.3.4' }), CODIGO),
    ).rejects.toThrow(/Muitas tentativas/);
    expect(d.usuarios.criados).toHaveLength(3);
  });

  it('conta tentativa mesmo com código errado — senão o limite seria contornável', async () => {
    const d = criarDeps();
    for (let i = 0; i < 3; i += 1) {
      await cadastrar(d, entrada({ codigo: 'chute', origem: '9.9.9.9' }), CODIGO).catch(
        () => undefined,
      );
    }

    await expect(cadastrar(d, entrada({ origem: '9.9.9.9' }), CODIGO)).rejects.toThrow(
      /Muitas tentativas/,
    );
  });
});
