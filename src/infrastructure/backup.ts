/**
 * Export/import do estado completo (SPEC 8). É a única garantia contra perda
 * de dados num app local — por isso trata como cidadão de primeira classe:
 * antes de importar, faz backup do arquivo .db.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';

export const BACKUP_VERSION = 1;

const DB_PATH = path.resolve(process.cwd(), 'data', 'app.db');

export async function exportarTudo(db: PrismaClient): Promise<unknown> {
  const [config, contas, categorias, custosFixos, provisoes, parcelamentos, ciclos, transacoes, snapshots] =
    await Promise.all([
      db.config.findUnique({ where: { id: 1 } }),
      db.conta.findMany(),
      db.categoria.findMany(),
      db.custoFixo.findMany(),
      db.provisaoAnual.findMany(),
      db.parcelamento.findMany(),
      db.ciclo.findMany(),
      db.transacao.findMany(),
      db.snapshotPatrimonio.findMany({ include: { itens: true } }),
    ]);

  return {
    version: BACKUP_VERSION,
    exportadoEm: new Date().toISOString(),
    dados: { config, contas, categorias, custosFixos, provisoes, parcelamentos, ciclos, transacoes, snapshots },
  };
}

const backupSchema = z.object({
  version: z.number(),
  dados: z.object({
    config: z.record(z.string(), z.unknown()).nullable(),
    contas: z.array(z.record(z.string(), z.unknown())),
    categorias: z.array(z.record(z.string(), z.unknown())),
    custosFixos: z.array(z.record(z.string(), z.unknown())),
    provisoes: z.array(z.record(z.string(), z.unknown())),
    parcelamentos: z.array(z.record(z.string(), z.unknown())),
    ciclos: z.array(z.record(z.string(), z.unknown())),
    transacoes: z.array(z.record(z.string(), z.unknown())),
    snapshots: z.array(z.record(z.string(), z.unknown())),
  }),
});

/** Faz backup do arquivo .db atual, depois substitui todos os dados. */
export async function importarTudo(db: PrismaClient, payload: unknown): Promise<{ backupCriado: string }> {
  const parsed = backupSchema.parse(payload);
  const d = parsed.dados;

  // 1) Backup do arquivo do banco antes de qualquer escrita destrutiva.
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.resolve(process.cwd(), 'data', `app.backup-${carimbo}.db`);
  try {
    await fs.copyFile(DB_PATH, backupPath);
  } catch {
    // Se o arquivo não existir ainda, seguimos (import em base recém-criada).
  }

  // 2) Limpa tudo (ordem respeita as FKs) e recria.
  await db.$transaction(async (tx) => {
    await tx.transacao.deleteMany();
    await tx.parcelamento.deleteMany();
    await tx.itemPatrimonio.deleteMany();
    await tx.snapshotPatrimonio.deleteMany();
    await tx.ciclo.deleteMany();
    await tx.custoFixo.deleteMany();
    await tx.provisaoAnual.deleteMany();
    await tx.categoria.deleteMany();
    await tx.conta.deleteMany();
    await tx.config.deleteMany();

    // Ordem de criação respeita as FKs: entidades sem dependência primeiro,
    // depois as que referenciam (config -> conta; custoFixo -> conta;
    // parcelamento -> categoria; transacao -> tudo).
    if (d.contas.length) await tx.conta.createMany({ data: d.contas as never });
    if (d.categorias.length) await tx.categoria.createMany({ data: d.categorias as never });
    if (d.provisoes.length) await tx.provisaoAnual.createMany({ data: d.provisoes as never });
    if (d.config) await tx.config.create({ data: d.config as never });
    if (d.custosFixos.length) await tx.custoFixo.createMany({ data: d.custosFixos as never });
    if (d.parcelamentos.length) await tx.parcelamento.createMany({ data: d.parcelamentos as never });
    if (d.ciclos.length) await tx.ciclo.createMany({ data: d.ciclos as never });
    if (d.transacoes.length) await tx.transacao.createMany({ data: d.transacoes as never });

    for (const s of d.snapshots) {
      const { itens, ...snap } = s as { itens?: unknown[] } & Record<string, unknown>;
      await tx.snapshotPatrimonio.create({ data: snap as never });
      if (Array.isArray(itens) && itens.length) {
        await tx.itemPatrimonio.createMany({ data: itens as never });
      }
    }
  });

  return { backupCriado: backupPath };
}
