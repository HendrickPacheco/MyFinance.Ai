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
