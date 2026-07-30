/**
 * Seed (SPEC Fase 0): Config singleton, contas base (os 4 buckets) e as
 * categorias BR. Idempotente — pode rodar várias vezes sem duplicar.
 *
 * Valores monetários entram como placeholders (0); o usuário preenche renda,
 * dia de recebimento e meta na tela de Configuração (Fase 2).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface SeedCategoria {
  nome: string;
  grupo: 'VARIAVEL' | 'FIXO' | 'RENDA';
  essencial: boolean;
  ordem: number;
}

const CATEGORIAS: SeedCategoria[] = [
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

const CONTAS_BASE = [
  { nome: 'Conta Fixos', tipo: 'FIXOS' },
  { nome: 'Dia a dia', tipo: 'VARIAVEL' },
  { nome: 'Reserva de Emergência', tipo: 'RESERVA' },
  { nome: 'Investimentos', tipo: 'INVESTIMENTO' },
];

async function main(): Promise<void> {
  // Config singleton (id = 1). Só cria se ainda não existe (não sobrescreve o usuário).
  await prisma.config.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      rendaBaseCents: 0,
      rendaVariavel: false,
      diaRecebimento: 5,
      metaPoupancaCents: 0,
      moeda: 'BRL',
      timezone: 'America/Bahia',
      destinoSobra: 'RESERVA',
    },
  });

  for (const c of CATEGORIAS) {
    await prisma.categoria.upsert({
      where: { nome: c.nome },
      update: { grupo: c.grupo, essencial: c.essencial, ordem: c.ordem },
      create: c,
    });
  }

  // Contas base: cria só se não houver nenhuma conta daquele tipo ainda.
  for (const conta of CONTAS_BASE) {
    const existe = await prisma.conta.findFirst({ where: { tipo: conta.tipo } });
    if (!existe) {
      await prisma.conta.create({ data: conta });
    }
  }

  const totalCategorias = await prisma.categoria.count();
  const totalContas = await prisma.conta.count();
  console.log(`Seed ok: ${totalCategorias} categorias, ${totalContas} contas, Config singleton.`);
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
