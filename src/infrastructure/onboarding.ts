/**
 * Semeadura do workspace de UM dono (multi-tenant).
 *
 * Antes da virada multi-tenant isto era o `prisma/seed.ts`, rodado uma vez para
 * o banco inteiro. Agora cada usuário tem o próprio conjunto de finanças, então
 * o mesmo trabalho precisa acontecer para cada dono — inclusive para quem se
 * cadastrar depois.
 *
 * IDEMPOTENTE de ponta a ponta: pode rodar em toda requisição sem duplicar
 * nada. É o que permite chamá-la de forma preguiçosa (ver `src/composition.ts`)
 * em vez de depender de um script manual que alguém pode esquecer de rodar.
 */
import type { PrismaClient } from '@prisma/client';

interface SeedCategoria {
  nome: string;
  grupo: 'VARIAVEL' | 'FIXO' | 'RENDA';
  essencial: boolean;
  ordem: number;
}

export const CATEGORIAS_BASE: SeedCategoria[] = [
  { nome: 'Mercado', grupo: 'VARIAVEL', essencial: true, ordem: 1 },
  { nome: 'Delivery', grupo: 'VARIAVEL', essencial: false, ordem: 2 },
  { nome: 'Restaurante', grupo: 'VARIAVEL', essencial: false, ordem: 3 },
  { nome: 'Transporte', grupo: 'VARIAVEL', essencial: true, ordem: 4 },
  { nome: 'Combustível', grupo: 'VARIAVEL', essencial: true, ordem: 5 },
  { nome: 'Farmácia', grupo: 'VARIAVEL', essencial: true, ordem: 6 },
  { nome: 'Assinaturas', grupo: 'VARIAVEL', essencial: false, ordem: 7 },
  { nome: 'Lazer', grupo: 'VARIAVEL', essencial: false, ordem: 8 },
  { nome: 'Vestuário', grupo: 'VARIAVEL', essencial: false, ordem: 9 },
  { nome: 'Casa', grupo: 'VARIAVEL', essencial: true, ordem: 10 },
  { nome: 'Saúde', grupo: 'VARIAVEL', essencial: true, ordem: 11 },
  { nome: 'Educação', grupo: 'VARIAVEL', essencial: true, ordem: 12 },
  { nome: 'Presentes', grupo: 'VARIAVEL', essencial: false, ordem: 13 },
  { nome: 'Outros', grupo: 'VARIAVEL', essencial: false, ordem: 14 },
];

export const CONTAS_BASE = [
  { nome: 'Conta Fixos', tipo: 'FIXOS' },
  { nome: 'Dia a dia', tipo: 'VARIAVEL' },
  { nome: 'Reserva de Emergência', tipo: 'RESERVA' },
  { nome: 'Investimentos', tipo: 'INVESTIMENTO' },
];

/**
 * Garante Config, categorias e contas base para `donoId`.
 *
 * Valores monetários entram zerados de propósito: quem preenche renda, dia de
 * recebimento e meta é o usuário, na tela de Ajustes. Um valor "de exemplo"
 * aqui viraria dado falso na tela — proibido pela regra 9 do CLAUDE.md.
 */
export async function semearWorkspace(db: PrismaClient, donoId: string): Promise<void> {
  await db.config.upsert({
    where: { donoId },
    update: {}, // nunca sobrescreve o que o usuário já configurou
    create: {
      donoId,
      rendaBaseCents: 0,
      rendaVariavel: false,
      diaRecebimento: 5,
      metaPoupancaCents: 0,
      moeda: 'BRL',
      timezone: 'America/Bahia',
      destinoSobra: 'RESERVA',
    },
  });

  // `skipDuplicates` na constraint (donoId, nome): duas requisições concorrentes
  // do mesmo usuário não brigam nem duplicam categoria.
  await db.categoria.createMany({
    data: CATEGORIAS_BASE.map((c) => ({ ...c, donoId })),
    skipDuplicates: true,
  });

  // Conta não tem unicidade por nome (o usuário pode ter duas "Nubank"), então
  // a idempotência aqui é por tipo: só cria o bucket que ainda falta.
  for (const conta of CONTAS_BASE) {
    const existe = await db.conta.findFirst({ where: { donoId, tipo: conta.tipo } });
    if (!existe) {
      await db.conta.create({ data: { ...conta, donoId } });
    }
  }
}
