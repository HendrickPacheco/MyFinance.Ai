/**
 * Redefine a senha de um usuário existente.
 *
 *   pnpm senha:redefinir
 *
 * Existe porque `prisma/seed-owner.ts` é idempotente e NÃO toca na senha de um
 * usuário que já existe — comportamento correto para um seed, mas que deixa
 * quem esqueceu a senha sem saída.
 *
 * A senha é lida do TECLADO, com eco desligado. De propósito: passá-la pelo
 * `.env` a deixaria em texto claro no disco, e por argumento de linha de
 * comando a gravaria no histórico do shell. Aqui ela existe só na memória do
 * processo, o tempo de virar hash Argon2id.
 */
import { createInterface } from 'node:readline';
import { PrismaClient } from '@prisma/client';
import { Argon2HashSenha } from '../src/infrastructure/auth/argon2';

/** Mesmo piso do seed (prisma/seed-owner.ts). */
const TAMANHO_MINIMO_SENHA = 12;

/** Pergunta sem ecoar o que é digitado. */
function perguntarOculto(rotulo: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const saida = process.stdout as NodeJS.WriteStream & { muted?: boolean };

    // Enquanto `muted`, engole os caracteres em vez de imprimi-los.
    const escreverOriginal = saida.write.bind(saida);
    saida.write = ((chunk: string, ...resto: unknown[]) =>
      saida.muted && typeof chunk === 'string' && !chunk.includes(rotulo)
        ? true
        : escreverOriginal(chunk, ...(resto as []))) as typeof saida.write;

    rl.question(rotulo, (resposta) => {
      saida.muted = false;
      saida.write = escreverOriginal;
      rl.close();
      escreverOriginal('\n');
      resolve(resposta);
    });
    saida.muted = true;
  });
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const email = (process.argv[2] ?? process.env.OWNER_EMAIL ?? '').trim().toLowerCase();
    if (!email) {
      throw new Error('Informe o email: pnpm senha:redefinir seu@email.com');
    }

    const usuario = await prisma.usuario.findUnique({ where: { email } });
    if (!usuario) {
      throw new Error(`Usuário não encontrado: ${email}`);
    }

    console.log(`Redefinindo a senha de ${email} (papel ${usuario.papel}).`);
    const senha = await perguntarOculto('Nova senha: ');
    const confirmacao = await perguntarOculto('Repita a senha: ');

    if (senha !== confirmacao) {
      throw new Error('As duas senhas não são iguais. Nada foi alterado.');
    }
    if (senha.length < TAMANHO_MINIMO_SENHA) {
      throw new Error(
        `A senha precisa de ao menos ${TAMANHO_MINIMO_SENHA} caracteres (recebeu ${senha.length}). Nada foi alterado.`,
      );
    }

    await prisma.usuario.update({
      where: { email },
      data: { senhaHash: await new Argon2HashSenha().hashear(senha), ativo: true },
    });

    // Sessões antigas continuariam válidas com a senha velha na cabeça de quem
    // as abriu — trocar a senha tem que expulsar quem já estava dentro.
    const { count } = await prisma.sessao.deleteMany({ where: { usuarioId: usuario.id } });

    console.log(`\nSenha redefinida. ${count} sessão(ões) encerrada(s) — faça login de novo.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((erro: unknown) => {
  console.error(`\n${erro instanceof Error ? erro.message : String(erro)}`);
  process.exitCode = 1;
});
