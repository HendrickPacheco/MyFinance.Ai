/**
 * Barril público do kernel da API do agente. Toda rota em
 * `app/api/agent/v1/**` importa só daqui (nunca dos arquivos internos
 * individualmente) — isto é a superfície estável que os ~60 handlers
 * dependem.
 */
export { rotaAgente, rotaEscrita } from './rotas';
export type {
  ContextoLeituraAgente,
  ConfigRotaAgente,
  ContextoEscritaAgente,
  ConfigRotaEscrita,
  AuditarFn,
  AuditarEntrada,
} from './rotas';

export { ErroApi, mapearErroApi } from './erros';
export type { ErroApiMapeado, CorpoErroApi } from './erros';

export { comFmt } from './formatacao';

export {
  dataCivilSchema,
  booleanDeQuerySchema,
  paginacaoSchema,
  objetoDaQuery,
  LIMITE_PADRAO,
  LIMITE_MAXIMO,
} from './validacao';
export type { Paginacao } from './validacao';

export type { ImpactoCiclo, RespostaImpactoCiclo } from './impacto-ciclo';
