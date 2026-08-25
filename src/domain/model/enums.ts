/**
 * Uniões de string do domínio. Modeladas como `const` + tipo derivado para
 * dar exaustividade em switch sem depender de enums do Prisma (o domínio não
 * conhece o Prisma — SPEC 5 e arquitetura hexagonal).
 */

export const TIPO_TRANSACAO = ['DESPESA', 'RENDA', 'TRANSFERENCIA', 'ESTORNO'] as const;
export type TipoTransacao = (typeof TIPO_TRANSACAO)[number];

export const GRUPO_CATEGORIA = ['VARIAVEL', 'FIXO', 'RENDA'] as const;
export type GrupoCategoria = (typeof GRUPO_CATEGORIA)[number];

export const TIPO_CONTA = ['FIXOS', 'VARIAVEL', 'RESERVA', 'INVESTIMENTO'] as const;
export type TipoConta = (typeof TIPO_CONTA)[number];

export const METODO_PAGAMENTO = ['PIX', 'DEBITO', 'CREDITO', 'DINHEIRO', 'BOLETO'] as const;
export type MetodoPagamento = (typeof METODO_PAGAMENTO)[number];

export const DESTINO_SOBRA = ['RESERVA', 'INVESTIMENTO', 'ROLLOVER'] as const;
export type DestinoSobra = (typeof DESTINO_SOBRA)[number];

export const CLASSE_PATRIMONIO = [
  'CONTA',
  'RENDA_FIXA',
  'RENDA_VARIAVEL',
  'CRIPTO',
  'IMOVEL',
  'OUTRO',
] as const;
export type ClassePatrimonio = (typeof CLASSE_PATRIMONIO)[number];

export const TENDENCIA = ['SUBINDO', 'ESTAVEL', 'CAINDO'] as const;
export type Tendencia = (typeof TENDENCIA)[number];

// ── Importação de fatura ───────────────────────────────────────────────────
// Estas quatro uniões são a fonte ÚNICA do vocabulário da importação: o motor
// puro (`domain/finance/importacao-tipos.ts`), as entidades de persistência e
// o adapter Prisma derivam todos daqui. Nasceram duplicadas em dois arquivos
// — a mesma armadilha que o comentário do `veredito` no `schema.prisma`
// documenta: dois vocabulários para o mesmo fato é como um deles envelhece
// sozinho, e ninguém percebe até um `switch` deixar de ser exaustivo.

export const ORIGEM_IMPORTACAO = ['TEXTO_COLADO', 'PDF'] as const;
export type OrigemImportacao = (typeof ORIGEM_IMPORTACAO)[number];

export const STATUS_IMPORTACAO = ['RASCUNHO', 'CONFIRMADA', 'DESCARTADA'] as const;
export type StatusImportacao = (typeof STATUS_IMPORTACAO)[number];

/**
 * O que a linha da fatura É, independentemente do sinal do número impresso —
 * cada banco imprime estorno de um jeito (menos, parênteses, "CR"), e ler o
 * sentido do caractere é como o extrator erra.
 */
export const SINAL_LINHA_FATURA = ['COMPRA', 'ESTORNO', 'TARIFA', 'PAGAMENTO_FATURA'] as const;
export type SinalLinhaFatura = (typeof SINAL_LINHA_FATURA)[number];

/** Certeza da TRANSCRIÇÃO. Enum, nunca `0..1` — float não é auditável. */
export const CONFIANCA_TRANSCRICAO = ['ALTA', 'MEDIA', 'BAIXA'] as const;
export type ConfiancaTranscricao = (typeof CONFIANCA_TRANSCRICAO)[number];

/** Os nomes gravados em `ItemImportado.veredito`. Ver `Veredito` no motor. */
export const TIPO_VEREDITO = [
  'CASA_PARCELA',
  'CASA_VARIAVEL',
  'CASA_CUSTO_FIXO',
  'NOVA_AVULSA',
  'NOVA_PARCELA_ORFA',
  'AMBIGUA',
  'IGNORAR',
] as const;
export type TipoVeredito = (typeof TIPO_VEREDITO)[number];

export const ALVO_TIPO_ITEM_IMPORTADO = ['TRANSACAO', 'CUSTO_FIXO'] as const;
export type AlvoTipoItemImportado = (typeof ALVO_TIPO_ITEM_IMPORTADO)[number];

export const DECISAO_ITEM_IMPORTADO = ['PENDENTE', 'APROVADA', 'DESCARTADA', 'GRAVADA'] as const;
export type DecisaoItemImportado = (typeof DECISAO_ITEM_IMPORTADO)[number];
