/**
 * Seed do usuário OWNER. Idempotente: rodar duas vezes não duplica nem
 * re-hasheia à toa.
 *
 *   pnpm db:seed-owner
 *
 * Lê do .env:
 *   OWNER_EMAIL            (obrigatório)
 *   OWNER_SENHA_INICIAL    (obrigatório na 1ª execução; apague depois)
 *   OWNER_NOME             (opcional)
 */
import { PrismaClient } from '@prisma/client';
import { Argon2HashSenha } from '../src/infrastructure/auth/argon2';

const prisma = new PrismaClient();
const hasher = new Argon2HashSenha();

/** Piso deliberadamente modesto: o objetivo é barrar "123", não ditar política. */
const TAMANHO_MINIMO_SENHA = 12;

async function main() {
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const senha = process.env.OWNER_SENHA_INICIAL;
  const nome = process.env.OWNER_NOME?.trim() || null;

  if (!email) {
    throw new Error('OWNER_EMAIL ausente no .env — defina antes de rodar o seed.');
  }

  const existente = await prisma.usuario.findUnique({ where: { email } });

  if (existente) {
    // Já existe: garante o papel e o estado ativo, mas NÃO toca na senha.
    // Se tocasse, rodar o seed de novo derrubaria a senha que o dono já
    // escolheu depois do primeiro login.
    await prisma.usuario.update({
      where: { email },
      data: { papel: 'OWNER', ativo: true, ...(nome ? { nome } : {}) },
    });
    console.log(`OWNER já existia: ${email} (papel e estado confirmados; senha intacta).`);
    return;
  }

  if (!senha) {
    throw new Error(
      'OWNER_SENHA_INICIAL ausente no .env — obrigatória para criar o OWNER pela primeira vez.',
    );
  }
  if (senha.length < TAMANHO_MINIMO_SENHA) {
    throw new Error(`OWNER_SENHA_INICIAL precisa de ao menos ${TAMANHO_MINIMO_SENHA} caracteres.`);
  }

  await prisma.usuario.create({
    data: { email, nome, senhaHash: await hasher.hashear(senha), papel: 'OWNER', ativo: true },
  });

  console.log(`OWNER criado: ${email}`);
  console.log('Apague OWNER_SENHA_INICIAL do .env agora — ela já cumpriu a função.');
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
