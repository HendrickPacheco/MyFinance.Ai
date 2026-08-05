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
 *   3 — adiciona `dados.memorias` (memória do copiloto, Fase E). Também
 *       aditiva. O VETOR NÃO VIAJA no arquivo: são 1536 floats por memória,
 *       que multiplicariam o tamanho do backup por dezenas sem carregar
 *       nenhuma informação que não possa ser recomputada. Memória restaurada
 *       volta sem embedding — continua listada, editável e no prompt de
 *       sistema; só sai da busca semântica até ser reindexada (há um botão
 *       para isso na tela de memória).
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
export const BACKUP_VERSION = 3;
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

/**
 * Exporta o estado financeiro DE UM DONO (multi-tenant).
 *
 * O `donoId` NÃO viaja no arquivo: ele é removido na exportação e recarimbado
 * na importação. Duas consequências, ambas desejadas:
 *  - um backup é portátil (dá para restaurá-lo numa conta nova);
 *  - um backup NUNCA carrega o id de outro usuário para dentro do banco.
 */
export async function exportarTudo(db: PrismaClient, donoId: string): Promise<unknown> {
  const doDono = { donoId };
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
    memorias,
  ] = await Promise.all([
    db.config.findUnique({ where: { donoId } }),
    db.conta.findMany({ where: doDono }),
    db.categoria.findMany({ where: doDono }),
    db.custoFixo.findMany({ where: doDono }),
    db.provisaoAnual.findMany({ where: doDono }),
    db.parcelamento.findMany({ where: doDono }),
    db.ciclo.findMany({ where: doDono }),
    db.pagamentoFixo.findMany({ where: doDono }),
    db.transacao.findMany({ where: doDono }),
    db.snapshotPatrimonio.findMany({ where: doDono, include: { itens: true } }),
    // `embedding` é `Unsupported` no schema, então o Prisma Client não o lê e
    // ele fica de fora por construção — não é preciso removê-lo à mão.
    db.memoria.findMany({ where: doDono }),
  ]);

  return {
    version: BACKUP_VERSION,
    exportadoEm: new Date().toISOString(),
    dados: {
      config: semDono(config),
      contas: contas.map(semDono),
      categorias: categorias.map(semDono),
      custosFixos: custosFixos.map(semDono),
      provisoes: provisoes.map(semDono),
      parcelamentos: parcelamentos.map(semDono),
      ciclos: ciclos.map(semDono),
      pagamentosFixos: pagamentosFixos.map(semDono),
      transacoes: transacoes.map(semDono),
      snapshots: snapshots.map(semDono),
      memorias: memorias.map(semDono),
    },
  };
}

/** Tira `donoId` do registro exportado — ver o comentário de `exportarTudo`. */
function semDono<T extends { donoId?: string }>(registro: T): Omit<T, 'donoId'>;
function semDono<T extends { donoId?: string }>(registro: T | null): Omit<T, 'donoId'> | null;
function semDono<T extends { donoId?: string }>(registro: T | null): Omit<T, 'donoId'> | null {
  if (!registro) return null;
  const { donoId: _descartado, ...resto } = registro;
  return resto;
}

/**
 * SCHEMAS ESTRITOS POR TABELA.
 *
 * Antes, cada registro era validado como `z.record(z.string(), z.unknown())` e
 * entregue ao Prisma com `as never`: qualquer chave passava. Isso é
 * mass-assignment — o payload decidia o que ia para o banco.
 *
 * `.strict()` faz o Zod REJEITAR chave desconhecida em vez de repassá-la, e o
 * tipo agora fecha sozinho, o que permitiu remover todos os `as never`.
 *
 * Regras do projeto preservadas: todo campo monetário é `Int` (`z.number().int()`)
 * e toda data civil é `string` "YYYY-MM-DD" — nunca `Date`.
 *
 * COMPATIBILIDADE: campos com `@default` no schema, e campos anuláveis, são
 * `.optional()`/`.nullish()` aqui — um backup gerado antes de a coluna existir
 * simplesmente não traz a chave, e recusá-lo deixaria o dono sem conseguir
 * restaurar o próprio arquivo (o pior desfecho possível, ver BACKUP_VERSION).
 * Isso NÃO afrouxa a defesa: `.strict()` continua rejeitando chave DESCONHECIDA,
 * que é o vetor de mass-assignment.
 */
const dataCivil = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'data civil deve ser "YYYY-MM-DD"');

/**
 * `createdAt`/`updatedAt` chegam de duas formas legítimas: string ISO quando o
 * backup veio de um arquivo JSON (caminho HTTP), e `Date` quando o payload é o
 * próprio `exportarTudo` em memória (salvaguarda pré-import, round-trip nos
 * testes). O Prisma aceita ambas — o schema também precisa aceitar, senão a
 * salvaguarda que existe para PROTEGER os dados seria a primeira coisa a
 * quebrar o import.
 *
 * São timestamps de infraestrutura, não datas civis do domínio (que continuam
 * `string` "YYYY-MM-DD", validadas por `dataCivil`).
 */
const carimboISO = z.union([z.string().datetime({ offset: true }), z.string().datetime(), z.date()]);

const configSchema = z
  .object({
    id: z.literal(1),
    rendaBaseCents: z.number().int(),
    rendaVariavel: z.boolean().optional(),
    diaRecebimento: z.number().int().min(1).max(31),
    metaPoupancaCents: z.number().int(),
    metaPoupancaPercent: z.number().nullish(),
    moeda: z.string().optional(),
    timezone: z.string().optional(),
    destinoSobra: z.string().optional(),
    destinoSobraContaId: z.string().nullish(),
    pisoDiarioVerbaCents: z.number().int().optional(),
    updatedAt: carimboISO.optional(),
  })
  .strict();

const contaSchema = z
  .object({
    id: z.string(),
    nome: z.string(),
    tipo: z.string(),
    saldoCents: z.number().int().optional(),
    incluiPatrimonio: z.boolean().optional(),
    arquivada: z.boolean().optional(),
  })
  .strict();

const categoriaSchema = z
  .object({
    id: z.string(),
    nome: z.string(),
    grupo: z.string(),
    essencial: z.boolean().optional(),
    icone: z.string().nullish(),
    cor: z.string().nullish(),
    ordem: z.number().int().optional(),
  })
  .strict();

const custoFixoSchema = z
  .object({
    id: z.string(),
    nome: z.string(),
    valorCents: z.number().int(),
    diaVencimento: z.number().int(),
    ativo: z.boolean().optional(),
    contaId: z.string().nullish(),
  })
  .strict();

const provisaoSchema = z
  .object({
    id: z.string(),
    nome: z.string(),
    valorAnualCents: z.number().int(),
    mesEsperado: z.number().int().nullish(),
    acumuladoCents: z.number().int().optional(),
    ativo: z.boolean().optional(),
  })
  .strict();

const parcelamentoSchema = z
  .object({
    id: z.string(),
    descricao: z.string(),
    valorTotalCents: z.number().int(),
    numParcelas: z.number().int(),
    dataCompra: dataCivil,
    categoriaId: z.string().nullish(),
  })
  .strict();

const cicloSchema = z
  .object({
    id: z.string(),
    dataInicio: dataCivil,
    dataFim: dataCivil,
    rendaPrevistaCents: z.number().int(),
    rendaRealizadaCents: z.number().int().nullish(),
    poupancaAlvoCents: z.number().int(),
    fixosCents: z.number().int(),
    provisaoMensalCents: z.number().int(),
    verbaVariavelCents: z.number().int(),
    rolloverRecebidoCents: z.number().int().optional(),
    fechado: z.boolean().optional(),
    fechadoEm: dataCivil.nullish(),
    sobraCents: z.number().int().nullish(),
    observacao: z.string().nullish(),
  })
  .strict();

const pagamentoFixoSchema = z
  .object({
    id: z.string(),
    custoFixoId: z.string(),
    cicloId: z.string(),
    pagoEm: dataCivil,
    createdAt: carimboISO.optional(),
  })
  .strict();

const transacaoSchema = z
  .object({
    id: z.string(),
    data: dataCivil,
    valorCents: z.number().int(),
    tipo: z.string(),
    descricao: z.string().nullish(),
    metodo: z.string().nullish(),
    categoriaId: z.string().nullish(),
    contaId: z.string().nullish(),
    contaDestinoId: z.string().nullish(),
    provisaoId: z.string().nullish(),
    parcelamentoId: z.string().nullish(),
    parcelaNum: z.number().int().nullish(),
    estornoDeId: z.string().nullish(),
    cicloId: z.string().nullish(),
    createdAt: carimboISO.optional(),
    pagoEm: dataCivil.nullish(),
  })
  .strict();

const itemPatrimonioSchema = z
  .object({
    id: z.string(),
    snapshotId: z.string(),
    nome: z.string(),
    classe: z.string(),
    valorCents: z.number().int(),
  })
  .strict();

const snapshotSchema = z
  .object({
    id: z.string(),
    data: dataCivil,
    totalCents: z.number().int(),
    itens: z.array(itemPatrimonioSchema).default([]),
  })
  .strict();

/**
 * Memória do copiloto (Fase E). Sem `embedding` de propósito — ver o histórico
 * de versões no topo do arquivo.
 *
 * 🔴 `texto` de um backup NÃO passa pela guarda `validarTextoMemoria`: um
 * arquivo gerado antes de uma regra futura ficar mais rígida deve continuar
 * restaurável (é a mesma razão de `MIN_BACKUP_VERSION_COMPATIVEL` existir).
 * A guarda protege a ESCRITA NOVA, que é por onde o valor entraria.
 */
const memoriaSchema = z
  .object({
    id: z.string(),
    tipo: z.string(),
    texto: z.string(),
    origem: z.string().optional(),
    ativo: z.boolean().optional(),
    createdAt: carimboISO.optional(),
    updatedAt: carimboISO.optional(),
  })
  .strict();

const backupSchema = z.object({
  version: z.number().int(),
  dados: z.object({
    config: configSchema.nullish(),
    contas: z.array(contaSchema),
    categorias: z.array(categoriaSchema),
    custosFixos: z.array(custoFixoSchema),
    provisoes: z.array(provisaoSchema),
    parcelamentos: z.array(parcelamentoSchema),
    ciclos: z.array(cicloSchema),
    // Opcional + default: backups versão 1 (antes de PagamentoFixo existir)
    // não têm esta chave. Ausência vira lista vazia em vez de erro de
    // validação — ver comentário de BACKUP_VERSION sobre compatibilidade.
    pagamentosFixos: z.array(pagamentoFixoSchema).default([]),
    transacoes: z.array(transacaoSchema),
    snapshots: z.array(snapshotSchema),
    // Mesma razão de `pagamentosFixos`: backups versão 1 e 2 não têm esta
    // chave, e recusá-los deixaria o dono sem restaurar o próprio arquivo.
    memorias: z.array(memoriaSchema).default([]),
  }),
});

/**
 * Grava um snapshot JSON restaurável do estado atual em ./data, carimbado
 * com data/hora. É a salvaguarda contra o import destrutivo (SPEC 8): se a
 * escrita falhar por qualquer motivo (permissão, disco cheio, diretório
 * ausente), a falha se propaga como `BackupSalvaguardaError` — nunca é
 * engolida em silêncio, porque sem ela não há rede de segurança.
 */
async function salvaguardarEstadoAtual(db: PrismaClient, donoId: string): Promise<string> {
  const estadoAtual = await exportarTudo(db, donoId);
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
/**
 * Importa um backup PARA UM DONO. Só apaga e só grava linhas dele — restaurar
 * o backup de um usuário jamais toca os dados de outro.
 */
export async function importarTudo(
  db: PrismaClient,
  payload: unknown,
  donoId: string,
): Promise<{ backupCriado: string }> {
  const parsed = backupSchema.parse(payload);
  if (parsed.version < MIN_BACKUP_VERSION_COMPATIVEL || parsed.version > BACKUP_VERSION) {
    throw new BackupVersaoIncompativelError(parsed.version, MIN_BACKUP_VERSION_COMPATIVEL, BACKUP_VERSION);
  }
  const d = parsed.dados;

  // 1) Salvaguarda do estado atual antes de qualquer escrita destrutiva. Se
  // isto lançar, o import aborta aqui — a transação abaixo nunca abre.
  const backupPath = await salvaguardarEstadoAtual(db, donoId);

  // 2) Limpa tudo (ordem respeita as FKs — PostgreSQL as IMPÕE, ao contrário
  // do SQLite usado antes neste projeto) e recria.
  await db.$transaction(async (tx) => {
    // pagamentoFixo referencia custoFixo E ciclo: precisa sumir antes dos
    // dois. transacao referencia praticamente tudo: some primeiro de todas.
    //
    // NOTA DE SEGURANÇA: `Usuario`, `Sessao` e `UsoIA` NÃO entram nesta lista
    // e não devem entrar. Backup é dos dados FINANCEIROS; restaurar um backup
    // não pode apagar credenciais nem deslogar o dono (pior: restaurar um
    // backup antigo devolveria o acesso a um usuário já desativado).
    await tx.transacao.deleteMany({ where: { donoId } });
    await tx.pagamentoFixo.deleteMany({ where: { donoId } });
    await tx.parcelamento.deleteMany({ where: { donoId } });
    await tx.itemPatrimonio.deleteMany();
    await tx.snapshotPatrimonio.deleteMany({ where: { donoId } });
    await tx.ciclo.deleteMany({ where: { donoId } });
    await tx.custoFixo.deleteMany({ where: { donoId } });
    await tx.provisaoAnual.deleteMany({ where: { donoId } });
    await tx.categoria.deleteMany({ where: { donoId } });
    await tx.conta.deleteMany({ where: { donoId } });
    await tx.config.deleteMany({ where: { donoId } });
    // Memoria não é referenciada por ninguém: a ordem dela é indiferente.
    await tx.memoria.deleteMany({ where: { donoId } });

    // Ordem de criação respeita as FKs: entidades sem dependência primeiro,
    // depois as que referenciam (config -> conta; custoFixo -> conta;
    // parcelamento -> categoria; ciclo -> nenhuma FK própria; pagamentoFixo
    // -> custoFixo + ciclo; transacao -> tudo).
    // Todo registro é carimbado com o donoId de QUEM ESTÁ IMPORTANDO, não com
    // nada vindo do arquivo — o arquivo nem carrega donoId (ver `exportarTudo`).
    const comDono = <T,>(registros: readonly T[]) => registros.map((r) => ({ ...r, donoId }));

    if (d.contas.length) await tx.conta.createMany({ data: comDono(d.contas) });
    if (d.categorias.length) await tx.categoria.createMany({ data: comDono(d.categorias) });
    if (d.provisoes.length) await tx.provisaoAnual.createMany({ data: comDono(d.provisoes) });
    if (d.config) await tx.config.create({ data: { ...d.config, donoId } });
    if (d.custosFixos.length) await tx.custoFixo.createMany({ data: comDono(d.custosFixos) });
    if (d.parcelamentos.length) await tx.parcelamento.createMany({ data: comDono(d.parcelamentos) });
    if (d.ciclos.length) await tx.ciclo.createMany({ data: comDono(d.ciclos) });
    // Sem `embedding`: o vetor não viaja no arquivo e é reindexado sob demanda.
    if (d.memorias.length) await tx.memoria.createMany({ data: comDono(d.memorias) });
    if (d.pagamentosFixos.length)
      await tx.pagamentoFixo.createMany({ data: comDono(d.pagamentosFixos) });
    if (d.transacoes.length) {
      // Transacao.estornoDeId referencia outra Transacao: insere primeiro as
      // que não são estorno (originais), depois as estornadoras, senão a FK
      // auto-referente pode falhar por ordem do array.
      const ordenadas = [...d.transacoes].sort((a, b) => {
        const ae = a.estornoDeId ? 1 : 0;
        const be = b.estornoDeId ? 1 : 0;
        return ae - be;
      });
      await tx.transacao.createMany({ data: comDono(ordenadas) });
    }

    for (const s of d.snapshots) {
      const { itens, ...snap } = s;
      await tx.snapshotPatrimonio.create({ data: { ...snap, donoId } });
      if (itens.length) {
        await tx.itemPatrimonio.createMany({ data: itens });
      }
    }
  });

  return { backupCriado: backupPath };
}
