/**
 * Barrel do motor de cálculo (SPEC seção 5). Toda regra de cálculo vive aqui,
 * em funções puras e testadas. Nenhuma regra pode viver em componente ou
 * server action — elas apenas orquestram estas funções.
 */
export * from './tipos';
export * from './ciclo';
export * from './verba';
export * from './teto';
export * from './ritmo';
export * from './recuperacao';
export * from './parcelamento';
export * from './analise';
export * from './patrimonio';
