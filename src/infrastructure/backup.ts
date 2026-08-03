/**
 * Export/import do estado completo (SPEC 8). É a única garantia contra perda
 * de dados num app local — por isso trata como cidadão de primeira classe:
 * antes de importar, grava uma salvaguarda em JSON do estado atual em
 * ./data (o banco é Postgres, não um arquivo copiável — a salvaguarda é o
 * próprio `exportarTudo` carimbado com data/hora, sem depender de binário
 * externo como `pg_dump`).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';

/**
 * Histórico de versões do formato de backup:
 *   1 — formato original (sem `PagamentoFixo`).
 *   2 — adiciona `dados.pagamentosFixos` (rastreamento de "pago?" dos custos
 *       fixos). Mudança PURAMENTE ADITIVA: nenhum campo existente mudou de
 *       forma ou nome, só uma coleção nova apareceu.
 *
 * Por a mudança ser aditiva, um backup versão 1 continua importável na v2:
 * `dados.pagamentosFixos` é opcional no schema Zod e vira lista vazia quando
 * ausente (ver `backupSchema`). Isso é deliberado — o usuário pode ter
 * gerado backups na v1 minutos antes desta mudança, e recusá-los deixaria
 * ele sem conseguir restaurar o próprio backup (o pior desfecho possível
 * para o módulo que a SPEC 8 chama de "única garantia contra perda de
 * dados"). `MIN_BACKUP_VERSION_COMPATIVEL` marca o piso de compatibilidade:
 * suba-o só quando uma mudança futura for INCOMPATÍVEL (campo renomeado,
 * removido, ou de shape diferente) — nesse caso, sim, backups abaixo do
 * piso devem ser recusados por `BackupVersaoIncompativelError`.
 */
export const BACKUP_VERSION = 2;
const MIN_BACKUP_VERSION_COMPATIVEL = 1;

const BACKUP_DIR = path.resolve(process.cwd(), 'data');

/**
 * Lançado quando o payload de import tem uma `version` fora da faixa que
 * este app sabe interpretar ([MIN_BACKUP_VERSION_COMPATIVEL, BACKUP_VERSION]).
 * Nunca deve ser aplicado — restaurar um formato desconhecido contra o
 * schema atual arrisca corromper silenciosamente os dados (SPEC 8).
 */
export class BackupVersaoIncompativelError extends Error {
  constructor(
    public readonly versaoRecebida: number,
    public readonly versaoMinima: number,
    public readonly versaoMaxima: number,
  ) {
    super(
      `Este backup está na versão ${versaoRecebida}, mas este app só sabe importar versões entre ` +
        `${versaoMinima} e ${versaoMaxima}. Restaurar mesmo assim arrisca interpretar os dados errado ` +
        'e corromper seu banco. Exporte um novo backup nesta versão do app, ou instale a versão do ' +
        'app compatível com este arquivo antes de importar.',
    );
    this.name = 'BackupVersaoIncompativelError';
  }
}

/**
 * Lançado quando a salvaguarda pré-import (gravar o snapshot JSON em ./data)
 * falha. Nunca deve ser engolida em silêncio: sem salvaguarda gravada com
 * sucesso, o import inteiro aborta ANTES de tocar no banco (SPEC 8).
 */
export class BackupSalvaguardaError extends Error {
  constructor(causa: unknown) {
    super(
      'Não foi possível gravar a salvaguarda em ./data antes do import. Para não arriscar ' +
        'perda de dados, o import foi abortado e nada foi escrito no banco. Verifique se o ' +
        'diretório ./data existe e tem permissão de escrita, e tente novamente.',
    );
    this.name = 'BackupSalvaguardaError';
    this.cause = causa;
  }
}

export async function exportarTudo(db: PrismaClient): Promise<unknown> {
  const [
    config,
    contas,
    categorias,
    custosFixos,
    provisoes,
    parcelamentos,
    ciclos,
    pagamentosFixos,
    transacoes,
    snapshots,
  ] = await Promise.all([
    db.config.findUnique({ where: { id: 1 } }),
    db.conta.findMany(),
    db.categoria.findMany(),
    db.custoFixo.findMany(),
    db.provisaoAnual.findMany(),
    db.parcelamento.findMany(),
    db.ciclo.findMany(),
    db.pagamentoFixo.findMany(),
    db.transacao.findMany(),
    db.snapshotPatrimonio.findMany({ include: { itens: true } }),
  ]);

  return {
    version: BACKUP_VERSION,
    exportadoEm: new Date().toISOString(),
    dados: {
      config,
      contas,
      categorias,
      custosFixos,
      provisoes,
      parcelamentos,
      ciclos,
      pagamentosFixos,
      transacoes,
      snapshots,
    },
  };
}

const backupSchema = z.object({
  version: z.number().int(),
  dados: z.object({
    config: z.record(z.string(), z.unknown()).nullable(),
    contas: z.array(z.record(z.string(), z.unknown())),
    categorias: z.array(z.record(z.string(), z.unknown())),
    custosFixos: z.array(z.record(z.string(), z.unknown())),
    provisoes: z.array(z.record(z.string(), z.unknown())),
    parcelamentos: z.array(z.record(z.string(), z.unknown())),
    ciclos: z.array(z.record(z.string(), z.unknown())),
    // Opcional + default: backups versão 1 (antes de PagamentoFixo existir)
    // não têm esta chave. Ausência vira lista vazia em vez de erro de
    // validação — ver comentário de BACKUP_VERSION sobre compatibilidade.
    pagamentosFixos: z.array(z.record(z.string(), z.unknown())).default([]),
    transacoes: z.array(z.record(z.string(), z.unknown())),
    snapshots: z.array(z.record(z.string(), z.unknown())),
  }),
});

/**
 * Grava um snapshot JSON restaurável do estado atual em ./data, carimbado
 * com data/hora. É a salvaguarda contra o import destrutivo (SPEC 8): se a
 * escrita falhar por qualquer motivo (permissão, disco cheio, diretório
 * ausente), a falha se propaga como `BackupSalvaguardaError` — nunca é
 * engolida em silêncio, porque sem ela não há rede de segurança.
 */
async function salvaguardarEstadoAtual(db: PrismaClient): Promise<string> {
  const estadoAtual = await exportarTudo(db);
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.resolve(BACKUP_DIR, `app.backup-${carimbo}.json`);
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    await fs.writeFile(backupPath, JSON.stringify(estadoAtual), 'utf-8');
  } catch (causa) {
    throw new BackupSalvaguardaError(causa);
  }
  return backupPath;
}

/** Salvaguarda o estado atual em ./data antes de substituir todos os dados. */
export async function importarTudo(db: PrismaClient, payload: unknown): Promise<{ backupCriado: string }> {
  const parsed = backupSchema.parse(payload);
  if (parsed.version < MIN_BACKUP_VERSION_COMPATIVEL || parsed.version > BACKUP_VERSION) {
    throw new BackupVersaoIncompativelError(parsed.version, MIN_BACKUP_VERSION_COMPATIVEL, BACKUP_VERSION);
  }
  const d = parsed.dados;

  // 1) Salvaguarda do estado atual antes de qualquer escrita destrutiva. Se
  // isto lançar, o import aborta aqui — a transação abaixo nunca abre.
  const backupPath = await salvaguardarEstadoAtual(db);

  // 2) Limpa tudo (ordem respeita as FKs — PostgreSQL as IMPÕE, ao contrário
  // do SQLite usado antes neste projeto) e recria.
  await db.$transaction(async (tx) => {
    // pagamentoFixo referencia custoFixo E ciclo: precisa sumir antes dos
    // dois. transacao referencia praticamente tudo: some primeiro de todas.
    await tx.transacao.deleteMany();
    await tx.pagamentoFixo.deleteMany();
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
    // parcelamento -> categoria; ciclo -> nenhuma FK própria; pagamentoFixo
    // -> custoFixo + ciclo; transacao -> tudo).
    if (d.contas.length) await tx.conta.createMany({ data: d.contas as never });
    if (d.categorias.length) await tx.categoria.createMany({ data: d.categorias as never });
    if (d.provisoes.length) await tx.provisaoAnual.createMany({ data: d.provisoes as never });
    if (d.config) await tx.config.create({ data: d.config as never });
    if (d.custosFixos.length) await tx.custoFixo.createMany({ data: d.custosFixos as never });
    if (d.parcelamentos.length) await tx.parcelamento.createMany({ data: d.parcelamentos as never });
    if (d.ciclos.length) await tx.ciclo.createMany({ data: d.ciclos as never });
    if (d.pagamentosFixos.length) await tx.pagamentoFixo.createMany({ data: d.pagamentosFixos as never });
    if (d.transacoes.length) {
      // Transacao.estornoDeId referencia outra Transacao: insere primeiro as
      // que não são estorno (originais), depois as estornadoras, senão a FK
      // auto-referente pode falhar por ordem do array.
      const ordenadas = [...d.transacoes].sort((a, b) => {
        const ae = (a as { estornoDeId?: unknown }).estornoDeId ? 1 : 0;
        const be = (b as { estornoDeId?: unknown }).estornoDeId ? 1 : 0;
        return ae - be;
      });
      await tx.transacao.createMany({ data: ordenadas as never });
    }

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
