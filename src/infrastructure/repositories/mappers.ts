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
  ProvisaoAnual as PProvisao,
  Transacao as PTransacao,
  Parcelamento as PParcelamento,
  Ciclo as PCiclo,
  SnapshotPatrimonio as PSnapshot,
  ItemPatrimonio as PItem,
} from '@prisma/client';
import type {
  Config,
  Conta,
  Categoria,
  CustoFixo,
  ProvisaoAnual,
  Transacao,
  Parcelamento,
  Ciclo,
  SnapshotPatrimonio,
  ItemPatrimonio,
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
