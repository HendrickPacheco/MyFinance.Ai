/**
 * Read-model da tela Ciclo (SPEC 7 e 5.3): composição da verba, ritmo,
 * projeção e extrato do ciclo atual.
 */
import type { Deps } from './deps';
import type { Categoria, Ciclo, Transacao } from '@/domain/model/entidades';
import {
  gastoRealizadoCents,
  indicadoresRitmo,
  type ResultadoRitmo,
} from '@/domain/finance';
import { garantirCicloAtual, lerCicloAtual, type CicloResolvido } from './ciclos';
import { indexarGrupoCategoria, paraCalculo } from './mapeamento';

export interface EstadoCiclo {
  hoje: string;
  ciclo: Ciclo;
  gastoRealizadoCents: number;
  ritmo: ResultadoRitmo;
  transacoes: Transacao[];
  categorias: Categoria[];
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

  const [transacoes, categorias] = await Promise.all([
    deps.transacoes.listarPorCiclo(ciclo.id),
    deps.categorias.listar(),
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

  return { hoje, ciclo, gastoRealizadoCents: gasto, ritmo, transacoes, categorias };
}
