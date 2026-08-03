/**
 * Sugestões de configuração (SPEC seção 6, regras 6 e 12). Funções PURAS que
 * transformam histórico de ciclos fechados em números acionáveis para a tela
 * de Configuração. Nenhuma delas altera o cálculo do teto do dia — são avisos
 * e sugestões de CONFIGURAÇÃO, nunca um piso escondido no motor (SPEC 13).
 */
import { assertCentavos } from '@/shared/dinheiro';

/** Nº máximo de ciclos fechados considerados para a sugestão de renda variável. */
const JANELA_RENDA_VARIAVEL = 6;
/** Nº mínimo de ciclos fechados para que a sugestão de renda variável exista. */
const MIN_CICLOS_RENDA_VARIAVEL = 2;
/** Nº de ciclos fechados mais recentes usados para provar uma meta sustentável. */
const JANELA_META_POUPANCA = 2;

/**
 * Regra 6 — renda variável: sugere `rendaPrevistaCents` como a MENOR renda
 * realizada entre os últimos `JANELA_RENDA_VARIAVEL` ciclos fechados.
 * Deliberadamente NÃO é a média: planejar pelo mês bom é o que produz dívida
 * no mês ruim.
 *
 * `rendasRealizadasCents` deve conter apenas ciclos com renda realizada
 * preenchida, ordenados do mais recente para o mais antigo — é o formato
 * devolvido por `CicloRepository.ultimosFechados`. Só os primeiros
 * `JANELA_RENDA_VARIAVEL` elementos são considerados.
 *
 * @returns A menor renda realizada em centavos, ou `null` se o histórico tiver
 *   menos de `MIN_CICLOS_RENDA_VARIAVEL` ciclos (sem dado real suficiente,
 *   não há sugestão — SPEC 13 proíbe estado fake).
 */
export function sugerirRendaPrevistaCents(rendasRealizadasCents: readonly number[]): number | null {
  if (rendasRealizadasCents.length < MIN_CICLOS_RENDA_VARIAVEL) return null;

  const consideradas = rendasRealizadasCents.slice(0, JANELA_RENDA_VARIAVEL);
  consideradas.forEach((valor) => assertCentavos(valor, 'rendaRealizadaCents'));
  return Math.min(...consideradas);
}

export interface VerificacaoMetaIrreal {
  /** true quando a verba diária ficou abaixo do piso configurado. */
  irreal: boolean;
  /** Verba variável do ciclo dividida pelos dias do ciclo (floor). */
  verbaDiariaCents: number;
  /** Piso diário usado na comparação (eco do parâmetro de entrada). */
  pisoDiarioCents: number;
}

/**
 * Regra 12 — meta irreal: verifica se `verbaVariavelCents / diasCiclo` cai
 * abaixo do piso diário configurável. É um AVISO DE CONFIGURAÇÃO — o teto do
 * dia continua 100% derivado de renda − fixos − parcelas − provisão −
 * poupança, sem piso embutido no cálculo (SPEC 13).
 *
 * @throws {RangeError} se `diasCiclo` não for um inteiro positivo.
 */
export function verificarMetaIrreal(params: {
  verbaVariavelCents: number;
  diasCiclo: number;
  pisoDiarioCents: number;
}): VerificacaoMetaIrreal {
  assertCentavos(params.verbaVariavelCents, 'verbaVariavelCents');
  assertCentavos(params.pisoDiarioCents, 'pisoDiarioCents');
  if (!Number.isInteger(params.diasCiclo) || params.diasCiclo <= 0) {
    throw new RangeError(`diasCiclo inválido: ${params.diasCiclo}`);
  }

  const verbaDiariaCents = Math.floor(params.verbaVariavelCents / params.diasCiclo);
  return {
    irreal: verbaDiariaCents < params.pisoDiarioCents,
    verbaDiariaCents,
    pisoDiarioCents: params.pisoDiarioCents,
  };
}

export interface CicloParaSugestaoMeta {
  /** Meta de poupança congelada daquele ciclo. */
  poupancaAlvoCents: number;
  /** Sobra do ciclo (`verbaVariavelCents - gastoRealizado`); `null` se ainda em aberto. */
  sobraCents: number | null;
}

/**
 * Regra 12 — sugestão de meta: quando o piso diário aponta uma meta irreal,
 * sugere um patamar de poupança com evidência real de ser sustentável — os
 * `JANELA_META_POUPANCA` ciclos fechados mais recentes ("últimos 2 ciclos"),
 * todos batendo a própria meta COM folga (sobra positiva).
 *
 * `ciclosRecentes` deve vir ordenado do mais recente para o mais antigo
 * (formato de `CicloRepository.ultimosFechados`); só os primeiros
 * `JANELA_META_POUPANCA` elementos são considerados.
 *
 * @returns A menor `poupancaAlvoCents` entre os ciclos considerados (o
 *   patamar mais conservador, já provado alcançável), ou `null` quando faltam
 *   ciclos suficientes ou algum deles não teve sobra positiva — sobra
 *   negativa ou ausente nunca gera sugestão de aumento de meta.
 */
export function sugerirMetaPoupancaCents(
  ciclosRecentes: readonly CicloParaSugestaoMeta[],
): number | null {
  if (ciclosRecentes.length < JANELA_META_POUPANCA) return null;

  const considerados = ciclosRecentes.slice(0, JANELA_META_POUPANCA);
  const todosComFolga = considerados.every((c) => c.sobraCents != null && c.sobraCents > 0);
  if (!todosComFolga) return null;

  return Math.min(...considerados.map((c) => c.poupancaAlvoCents));
}
