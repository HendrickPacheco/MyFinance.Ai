/**
 * Resolve o ANO de uma linha de fatura sem NUNCA usar `new Date(string)`
 * (SPEC 5.1 — essa construção é interpretada como UTC e retrocede um dia no
 * fuso do Brasil). TASKS-IMPORTACAO §10.
 *
 * A fatura imprime só "dia/mês" (ex.: "12/03", "12 MAR"); o ANO não está no
 * papel. O dono resolve 100% da ambiguidade estrutural ao informar a
 * COMPETÊNCIA da fatura no upload — daí sobram só dois candidatos de ano: o
 * da competência e o anterior.
 *
 * A razão de existir é a virada de dezembro: uma fatura de competência
 * "2027-01" tem linhas de dezembro que são de 2026, não de 2027. O candidato
 * "ano da competência" cai no FUTURO ali e precisa ser descartado por estar
 * fora da janela — nunca escolhido por "parecer" o ano certo.
 */
import { addMeses, estaNoIntervalo, ultimoDiaDoMes, MESES_ABREVIADOS_PT_BR, type DataCivil } from '@/shared/data';

const RE_COMPETENCIA = /^\d{4}-\d{2}$/;
const RE_DIA_MES_BARRA = /^(\d{1,2})\/(\d{1,2})$/;
const RE_DIA_MES_ABREVIADO = /^(\d{1,2})\s+([a-zçã]+)\.?$/i;

/** Preenche com zero à esquerda até 2 dígitos — nunca `new Date` para formatar. */
function doisDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

/** true se `dia/mes` existe de fato naquele ano específico (cobre 29/02). */
function diaMesExisteNoAno(dia: number, mes: number, ano: number): boolean {
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return false;
  if (!Number.isInteger(dia) || dia < 1) return false;
  return dia <= ultimoDiaDoMes(ano, mes);
}

/**
 * Lê "12/03", "12 MAR" ou "12 mar" para `{ dia, mes }`. Parsing puro de
 * TEXTO — não valida se a combinação existe no calendário (isso é trabalho
 * de `resolverAnoDaFatura`, que já precisa do ano para decidir). Texto que
 * não bate com nenhum dos dois formatos volta `null`, nunca um chute.
 */
export function lerDiaMes(texto: string): { dia: number; mes: number } | null {
  const limpo = texto.trim();

  const porBarra = RE_DIA_MES_BARRA.exec(limpo);
  if (porBarra) {
    return { dia: Number(porBarra[1]), mes: Number(porBarra[2]) };
  }

  const porAbreviacao = RE_DIA_MES_ABREVIADO.exec(limpo);
  if (porAbreviacao) {
    const diaTexto = porAbreviacao[1];
    const mesTexto = porAbreviacao[2];
    if (diaTexto === undefined || mesTexto === undefined) return null;
    const abreviacao = mesTexto.toLowerCase().slice(0, 3);
    const indiceMes = MESES_ABREVIADOS_PT_BR.indexOf(abreviacao as (typeof MESES_ABREVIADOS_PT_BR)[number]);
    if (indiceMes === -1) return null;
    return { dia: Number(diaTexto), mes: indiceMes + 1 };
  }

  return null;
}

export function resolverAnoDaFatura(params: {
  diaMes: { dia: number; mes: number };
  competenciaRef: string;
}): { data: DataCivil } | { ambigua: true; motivo: string } {
  const { dia, mes } = params.diaMes;
  const { competenciaRef } = params;

  if (!RE_COMPETENCIA.test(competenciaRef)) {
    throw new TypeError(`competenciaRef precisa estar em YYYY-MM, recebido: "${competenciaRef}"`);
  }

  if (mes < 1 || mes > 12) {
    return { ambigua: true, motivo: `mês ${mes} inválido: mês de calendário vai de 1 a 12` };
  }

  const anoCompetencia = Number(competenciaRef.slice(0, 4));
  const mesCompetencia = Number(competenciaRef.slice(5, 7));
  const fimDaCompetencia: DataCivil = `${competenciaRef}-${doisDigitos(ultimoDiaDoMes(anoCompetencia, mesCompetencia))}`;
  const inicioJanela = addMeses(fimDaCompetencia, -3);

  // Só dois candidatos possíveis: o ano da competência e o ano anterior.
  // Montados SEMPRE como string com padStart — nunca `new Date(string)`.
  const anosCandidatos = [anoCompetencia, anoCompetencia - 1];

  const anosComDiaMesValido = anosCandidatos.filter((ano) => diaMesExisteNoAno(dia, mes, ano));
  if (anosComDiaMesValido.length === 0) {
    return {
      ambigua: true,
      motivo: `dia ${dia} não existe no mês ${mes} nem em ${anosCandidatos[0]} nem em ${anosCandidatos[1]}`,
    };
  }

  const candidatosNaJanela = anosComDiaMesValido
    .map((ano) => `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`)
    .filter((data) => estaNoIntervalo(data, inicioJanela, fimDaCompetencia));

  if (candidatosNaJanela.length === 1) {
    const [data] = candidatosNaJanela;
    if (data === undefined) {
      throw new Error('estado inalcançável: candidatosNaJanela.length === 1 sem elemento em [0]');
    }
    return { data };
  }

  if (candidatosNaJanela.length === 0) {
    return {
      ambigua: true,
      motivo:
        `nenhum dos anos candidatos (${anosCandidatos[0]} e ${anosCandidatos[1]}) cai na janela de até ` +
        `3 meses antes da competência ${competenciaRef} (entre ${inicioJanela} e ${fimDaCompetencia})`,
    };
  }

  return {
    ambigua: true,
    motivo:
      `mais de um ano possível para "${doisDigitos(dia)}/${doisDigitos(mes)}": ` +
      `${candidatosNaJanela.join(' e ')} caem ambos na janela da competência ${competenciaRef} — ` +
      'não dá para decidir sem chutar',
  };
}
