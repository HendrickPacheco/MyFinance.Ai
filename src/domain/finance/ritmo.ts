/**
 * Indicadores de ritmo do ciclo (SPEC 5.3, tela do ciclo). São indicadores
 * de leitura (razões e projeções), não dinheiro em trânsito — por isso podem
 * ser fracionários. Dinheiro que move saldo continua sendo Int em centavos.
 */
import { assertData, diffDias, type DataCivil } from '@/shared/data';

export interface EntradaRitmo {
  verbaVariavelCents: number;
  dataInicio: DataCivil;
  dataFim: DataCivil;
  hoje: DataCivil;
  gastoRealizadoCents: number;
}

export interface ResultadoRitmo {
  diasDecorridos: number;
  diasTotaisCiclo: number;
  mediaDiariaRealCents: number;
  tetoInicialCents: number;
  projecaoFechamentoCents: number;
  /** >1 = gastando acima do sustentável; ==1 no ritmo; <1 abaixo. */
  ritmo: number;
}

/** Os mesmos indicadores, em centavos INTEIROS, prontos para exibição. */
export interface RitmoExibivel {
  mediaDiariaRealCents: number;
  tetoInicialCents: number;
  projecaoFechamentoCents: number;
}

/**
 * Converte os indicadores fracionários em centavos inteiros para EXIBIÇÃO.
 *
 * Existe porque `ResultadoRitmo` guarda razões (ex.: 1031.25), e qualquer
 * fronteira que formate dinheiro exige inteiro — `formatBRL` rejeita float
 * (CLAUDE.md regra 1). Sem isto, cada consumidor arredondaria do seu jeito e
 * a mesma média apareceria diferente em telas diferentes.
 *
 * Usa `round`, não `floor`: aqui não há total a preservar (não é rateio —
 * ver `ratearCents`), e para um indicador de leitura o inteiro mais próximo
 * é mais honesto que o truncado.
 *
 * O indicador cru continua fracionário — quem precisa de precisão usa
 * `ResultadoRitmo` direto.
 */
export function ritmoExibivel(r: ResultadoRitmo): RitmoExibivel {
  return {
    mediaDiariaRealCents: Math.round(r.mediaDiariaRealCents),
    tetoInicialCents: Math.round(r.tetoInicialCents),
    projecaoFechamentoCents: Math.round(r.projecaoFechamentoCents),
  };
}

export function indicadoresRitmo(e: EntradaRitmo): ResultadoRitmo {
  assertData(e.dataInicio);
  assertData(e.dataFim);
  assertData(e.hoje);

  const diasTotaisCiclo = diffDias(e.dataFim, e.dataInicio) + 1;
  const diasDecorridos = Math.max(diffDias(e.hoje, e.dataInicio) + 1, 1);

  const mediaDiariaRealCents = e.gastoRealizadoCents / diasDecorridos;
  const tetoInicialCents = diasTotaisCiclo > 0 ? e.verbaVariavelCents / diasTotaisCiclo : 0;
  const projecaoFechamentoCents = mediaDiariaRealCents * diasTotaisCiclo;
  const ritmo = tetoInicialCents > 0 ? mediaDiariaRealCents / tetoInicialCents : 0;

  return {
    diasDecorridos,
    diasTotaisCiclo,
    mediaDiariaRealCents,
    tetoInicialCents,
    projecaoFechamentoCents,
    ritmo,
  };
}
