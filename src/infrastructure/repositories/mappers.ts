/**
 * Tradução entre linhas do Prisma e entidades puras do domínio. Concentra os
 * casts de string->união aqui, para que o resto da infraestrutura e todo o
 * domínio permaneçam tipados sem conhecer o `@prisma/client`.
 */
import type {
  Config as PConfig,
  Conta as PConta,
  Categoria as PCategoria,
  CustoFixo as PCustoFixo,
  PagamentoFixo as PPagamentoFixo,
  ProvisaoAnual as PProvisao,
  Transacao as PTransacao,
  Parcelamento as PParcelamento,
  Ciclo as PCiclo,
  SnapshotPatrimonio as PSnapshot,
  ItemPatrimonio as PItem,
  Conversa as PConversa,
  MensagemConversa as PMensagemConversa,
} from '@prisma/client';
import type {
  Config,
  Conta,
  Categoria,
  CustoFixo,
  PagamentoFixo,
  ProvisaoAnual,
  Transacao,
  Parcelamento,
  Ciclo,
  SnapshotPatrimonio,
  ItemPatrimonio,
  Conversa,
  MensagemConversa,
  PapelMensagemConversa,
  Proveniencia,
} from '@/domain/model/entidades';
import type {
  TipoConta,
  TipoTransacao,
  GrupoCategoria,
  MetodoPagamento,
  DestinoSobra,
  ClassePatrimonio,
} from '@/domain/model/enums';

export function toConfig(r: PConfig): Config {
  return {
    id: r.id,
    rendaBaseCents: r.rendaBaseCents,
    rendaVariavel: r.rendaVariavel,
    diaRecebimento: r.diaRecebimento,
    metaPoupancaCents: r.metaPoupancaCents,
    metaPoupancaPercent: r.metaPoupancaPercent,
    moeda: r.moeda,
    timezone: r.timezone,
    destinoSobra: r.destinoSobra as DestinoSobra,
    destinoSobraContaId: r.destinoSobraContaId,
    pisoDiarioVerbaCents: r.pisoDiarioVerbaCents,
  };
}

export function toConta(r: PConta): Conta {
  return {
    id: r.id,
    nome: r.nome,
    tipo: r.tipo as TipoConta,
    saldoCents: r.saldoCents,
    incluiPatrimonio: r.incluiPatrimonio,
    arquivada: r.arquivada,
  };
}

export function toCategoria(r: PCategoria): Categoria {
  return {
    id: r.id,
    nome: r.nome,
    grupo: r.grupo as GrupoCategoria,
    essencial: r.essencial,
    icone: r.icone,
    cor: r.cor,
    ordem: r.ordem,
  };
}

export function toCustoFixo(r: PCustoFixo): CustoFixo {
  return {
    id: r.id,
    nome: r.nome,
    valorCents: r.valorCents,
    diaVencimento: r.diaVencimento,
    ativo: r.ativo,
    contaId: r.contaId,
    categoriaId: r.categoriaId,
    vigenteDe: r.vigenteDe,
    vigenteAte: r.vigenteAte,
  };
}

export function toPagamentoFixo(r: PPagamentoFixo): PagamentoFixo {
  return {
    id: r.id,
    custoFixoId: r.custoFixoId,
    cicloId: r.cicloId,
    pagoEm: r.pagoEm,
  };
}

export function toProvisao(r: PProvisao): ProvisaoAnual {
  return {
    id: r.id,
    nome: r.nome,
    valorAnualCents: r.valorAnualCents,
    mesEsperado: r.mesEsperado,
    acumuladoCents: r.acumuladoCents,
    ativo: r.ativo,
  };
}

export function toTransacao(r: PTransacao): Transacao {
  return {
    id: r.id,
    data: r.data,
    valorCents: r.valorCents,
    tipo: r.tipo as TipoTransacao,
    descricao: r.descricao,
    metodo: r.metodo as MetodoPagamento | null,
    categoriaId: r.categoriaId,
    contaId: r.contaId,
    contaDestinoId: r.contaDestinoId,
    provisaoId: r.provisaoId,
    parcelamentoId: r.parcelamentoId,
    parcelaNum: r.parcelaNum,
    estornoDeId: r.estornoDeId,
    cicloId: r.cicloId,
    pagoEm: r.pagoEm,
  };
}

export function toParcelamento(r: PParcelamento): Parcelamento {
  return {
    id: r.id,
    descricao: r.descricao,
    valorTotalCents: r.valorTotalCents,
    numParcelas: r.numParcelas,
    dataCompra: r.dataCompra,
    categoriaId: r.categoriaId,
    encerradoEm: r.encerradoEm,
  };
}

export function toCiclo(r: PCiclo): Ciclo {
  return {
    id: r.id,
    dataInicio: r.dataInicio,
    dataFim: r.dataFim,
    rendaPrevistaCents: r.rendaPrevistaCents,
    rendaRealizadaCents: r.rendaRealizadaCents,
    poupancaAlvoCents: r.poupancaAlvoCents,
    fixosCents: r.fixosCents,
    provisaoMensalCents: r.provisaoMensalCents,
    verbaVariavelCents: r.verbaVariavelCents,
    rolloverRecebidoCents: r.rolloverRecebidoCents,
    fechado: r.fechado,
    fechadoEm: r.fechadoEm,
    sobraCents: r.sobraCents,
    observacao: r.observacao,
  };
}

export function toItemPatrimonio(r: PItem): ItemPatrimonio {
  return {
    id: r.id,
    snapshotId: r.snapshotId,
    nome: r.nome,
    classe: r.classe as ClassePatrimonio,
    valorCents: r.valorCents,
    contaId: r.contaId,
  };
}

export function toSnapshot(r: PSnapshot & { itens: PItem[] }): SnapshotPatrimonio {
  return {
    id: r.id,
    data: r.data,
    totalCents: r.totalCents,
    itens: r.itens.map(toItemPatrimonio),
  };
}

export function toConversa(r: PConversa): Conversa {
  return {
    id: r.id,
    titulo: r.titulo,
    criadaEm: r.criadaEm,
    atualizadaEm: r.atualizadaEm,
  };
}

/**
 * O banco guarda `papel` como `String` (não há enum no schema). Um valor
 * corrompido degrada para `'assistente'` em vez de lançar — a mesma escolha
 * de `paraTipo` em `prisma-memoria.ts`: uma mensagem com papel estranho
 * continua visível na conversa, em vez de derrubar a tela inteira.
 */
function paraPapel(bruto: string): PapelMensagemConversa {
  return bruto === 'usuario' ? 'usuario' : 'assistente';
}

/**
 * `proveniencia` é `Json?` no schema — o Prisma devolve `Prisma.JsonValue`,
 * não `Proveniencia`. A validação aqui é estrutural e rasa de propósito: quem
 * grava é sempre `PrismaConversaRepository.anexarTurno`, a partir do mesmo
 * tipo do domínio, então o único jeito de chegar aqui malformado é uma
 * gravação manual no banco — e nesse caso `null` (perde a proveniência, não a
 * mensagem) é a degradação certa, não uma exceção que derruba a conversa.
 */
function paraProveniencia(bruto: unknown): Proveniencia | null {
  if (typeof bruto !== 'object' || bruto === null) return null;
  const candidata = bruto as Partial<Proveniencia>;
  if (
    !Array.isArray(candidata.ferramentasUsadas) ||
    !Array.isArray(candidata.valoresCitados) ||
    !Array.isArray(candidata.valoresNaoRastreados) ||
    !Array.isArray(candidata.propostas)
  ) {
    return null;
  }
  return {
    ferramentasUsadas: candidata.ferramentasUsadas,
    valoresCitados: candidata.valoresCitados,
    // Campo novo (11/08/2026): conversa gravada ANTES desta mudança não tem
    // esta chave no JSON persistido. Degrada para vazio em vez de rejeitar a
    // proveniência inteira — perder só o balde novo é melhor que perder
    // ferramentas e valores citados de uma conversa antiga.
    valoresInformados: Array.isArray(candidata.valoresInformados) ? candidata.valoresInformados : [],
    valoresNaoRastreados: candidata.valoresNaoRastreados,
    propostas: candidata.propostas,
    semFerramenta: candidata.semFerramenta === true,
    incompleta: candidata.incompleta === true,
  };
}

export function toMensagemConversa(r: PMensagemConversa): MensagemConversa {
  return {
    id: r.id,
    conversaId: r.conversaId,
    papel: paraPapel(r.papel),
    conteudo: r.conteudo,
    proveniencia: paraProveniencia(r.proveniencia),
    criadaEm: r.criadaEm,
  };
}
