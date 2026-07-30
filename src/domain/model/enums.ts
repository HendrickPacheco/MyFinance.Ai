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
