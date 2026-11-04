/**
 * Read-model da tela Ciclo (SPEC 7 e 5.3): composição da verba, ritmo,
 * projeção e extrato do ciclo atual.
 */
import type { Deps } from './deps';
import type { Categoria, Ciclo, Transacao } from '@/domain/model/entidades';
import {
  diasTotaisCiclo,
  dividirVerba,
  projetarDiaADiaDiarioCents,
  gastoRealizadoCents,
  type DivisaoVerba,
  indicadoresRitmo,
  type ResultadoRitmo,
} from '@/domain/finance';
import { garantirCicloAtual, lerCicloAtual, type CicloResolvido } from './ciclos';
import type { ResumoRendaCiclo } from './dashboard-tipos';
import { montarRenda } from './dashboard';
import { indexarGrupoCategoria, paraCalculo } from './mapeamento';

export interface EstadoCiclo {
  hoje: string;
  ciclo: Ciclo;
  gastoRealizadoCents: number;
  ritmo: ResultadoRitmo;
  transacoes: Transacao[];
  categorias: Categoria[];
  /** Split da verba (D1): gastável = verba − meta; dia a dia até o piso; resto em extras. */
  divisao: DivisaoVerba;
  /** Dia a dia efetivo por dia (floor) — menor que o piso quando a meta não cabe. */
  diaADiaDiarioCents: number;
  renda: ResumoRendaCiclo;
}

export async function obterEstadoCiclo(deps: Deps): Promise<EstadoCiclo> {
  return montar(deps, await garantirCicloAtual(deps));
}

/** Sem efeito colateral: não cria ciclo. `null` quando não há ciclo aberto. */
export async function obterEstadoCicloSomenteLeitura(deps: Deps): Promise<EstadoCiclo | null> {
  const resolvido = await lerCicloAtual(deps);
  return resolvido ? montar(deps, resolvido) : null;
}

/** Estado da tela de Ciclo para um ciclo QUALQUER (inclusive fechado), por id. */
export async function obterEstadoCicloPorId(deps: Deps, cicloId: string): Promise<EstadoCiclo | null> {
  const ciclo = await deps.ciclos.obter(cicloId);
  return ciclo ? montar(deps, { ciclo, pendenciaFechamento: null }) : null;
}

async function montar(deps: Deps, { ciclo }: CicloResolvido): Promise<EstadoCiclo> {
  const hoje = deps.relogio.hoje();

  const [transacoes, categorias, config] = await Promise.all([
    deps.transacoes.listarPorCiclo(ciclo.id),
    deps.categorias.listar(),
    deps.config.obter(),
  ]);

  const grupos = indexarGrupoCategoria(categorias);
  const calc = paraCalculo(transacoes, grupos);
  const gasto = gastoRealizadoCents(calc, ciclo.dataFim);

  const ritmo = indicadoresRitmo({
    verbaVariavelCents: ciclo.verbaVariavelCents,
    dataInicio: ciclo.dataInicio,
    dataFim: ciclo.dataFim,
    hoje,
    gastoRealizadoCents: gastoRealizadoCents(calc, hoje),
  });

  const diasCiclo = diasTotaisCiclo({ inicio: ciclo.dataInicio, fim: ciclo.dataFim });
  const divisao = dividirVerba({
    verbaVariavelCents: ciclo.verbaVariavelCents,
    poupancaAlvoCents: ciclo.poupancaAlvoCents,
    pisoDiarioCents: config?.pisoDiarioVerbaCents ?? 0,
    diasCiclo,
  });

  return {
    hoje,
    ciclo,
    gastoRealizadoCents: gasto,
    ritmo,
    transacoes,
    categorias,
    divisao,
    diaADiaDiarioCents: projetarDiaADiaDiarioCents(divisao, 0, diasCiclo),
    renda: montarRenda(ciclo, config),
  };
}
