import { describe, expect, it } from 'vitest';
import { Argon2HashSenha } from './argon2';

const hasher = new Argon2HashSenha();

describe('Argon2HashSenha', () => {
  it('produz hash diferente da senha em claro', async () => {
    const h = await hasher.hashear('senha-do-dono-123');
    expect(h).not.toBe('senha-do-dono-123');
    expect(h).not.toContain('senha-do-dono-123');
  });

  it('usa Argon2id (o prefixo do hash declara o algoritmo)', async () => {
    const h = await hasher.hashear('qualquer');
    expect(h.startsWith('$argon2id$')).toBe(true);
  });

  it('verifica a senha correta', async () => {
    const h = await hasher.hashear('senha-correta');
    expect(await hasher.verificar('senha-correta', h)).toBe(true);
  });

  it('rejeita a senha errada', async () => {
    const h = await hasher.hashear('senha-correta');
    expect(await hasher.verificar('senha-errada', h)).toBe(false);
  });

  it('gera hashes distintos para a mesma senha (sal aleatório)', async () => {
    const [a, b] = await Promise.all([hasher.hashear('mesma'), hasher.hashear('mesma')]);
    expect(a).not.toBe(b);
    // ...e ambos continuam verificando.
    expect(await hasher.verificar('mesma', a)).toBe(true);
    expect(await hasher.verificar('mesma', b)).toBe(true);
  });

  it('devolve false — não lança — para hash corrompido', async () => {
    expect(await hasher.verificar('senha', 'lixo-que-nao-e-hash')).toBe(false);
    expect(await hasher.verificar('senha', '')).toBe(false);
  });

  it('distingue senhas que só diferem no fim (sem truncar como o bcrypt em 72 bytes)', async () => {
    const longa = 'x'.repeat(80);
    const h = await hasher.hashear(`${longa}A`);
    expect(await hasher.verificar(`${longa}B`, h)).toBe(false);
    expect(await hasher.verificar(`${longa}A`, h)).toBe(true);
  });
});
