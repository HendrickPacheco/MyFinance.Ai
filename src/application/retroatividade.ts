/**
 * Guarda de retroatividade (SPEC regra 9 / TASKS-CUSTOS R2): qualquer caso de
 * uso que apaga ou edita `Transacao` de um ciclo já fechado precisa de
 * confirmação explícita do usuário e recalcula a sobra congelada daquele
 * ciclo a partir do estado atual das transações.
 *
 * Extraído de `src/application/transacoes.ts` (TASKS-CUSTOS Fase 5) para ser
 * reusado por `parcelamentos.ts` sem duplicar a peça mais arriscada do
 * domínio: editar ou excluir dentro de um ciclo fechado por fora desta guarda
 * corrompe `Ciclo.sobraCents` silenciosamente — sem lançar erro nenhum.
 * `transacoes.ts` reexporta `CicloFechadoError` para não quebrar quem já
 * importa a classe de lá (actions e testes existentes).
 */
import type { Deps } from './deps';
import type { Ciclo } from '@/domain/model/entidades';
import { sobraCiclo } from '@/domain/finance';
import { indexarGrupoCategoria, paraCalculo } from './mapeamento';

/**
 * Erro tipado e discriminável (SPEC regra 9): sinaliza que a operação foi
 * recusada por tocar um ciclo fechado sem confirmação. A camada de server
 * action reconhece este erro por `instanceof` e traduz em pedido de
 * confirmação para a UI — nunca deixa vazar como exceção genérica.
 */
export class CicloFechadoError extends Error {
  constructor(public readonly ciclosAfetados: readonly string[]) {
    super(
      'Esta transação pertence a um ciclo já fechado. Confirme para recalcular a sobra desse ciclo.',
    );
    this.name = 'CicloFechadoError';
  }
}

/**
 * Memoização de `ciclos.obter` para o escopo de UMA operação de leitura
 * (TASKS-CUSTOS §5.1 ticket 3).
 *
 * `listarParcelamentos` resolvia o ciclo de cada parcela de cada compra: com
 * 13 parcelamentos de 12 parcelas isso são ~150 consultas de ciclo, quase
 * todas repetindo os mesmos meia-dúzia de ids. O cache guarda a PROMESSA, não
 * o valor, para que duas resoluções concorrentes do mesmo id compartilhem a
 * mesma consulta em vez de disparar duas.
 *
 * Escopo curto de propósito: um cache de vida longa serviria ciclo fechado
 * como aberto depois de um fechamento. Crie um por chamada de read-model.
 */
export interface CacheCiclos {
  obter(id: string): Promise<Ciclo | null>;
}

export function criarCacheCiclos(deps: Deps): CacheCiclos {
  const emVoo = new Map<string, Promise<Ciclo | null>>();
  return {
    obter(id: string): Promise<Ciclo | null> {
      const existente = emVoo.get(id);
      if (existente) return existente;
      const promessa = deps.ciclos.obter(id);
      emVoo.set(id, promessa);
      return promessa;
    },
  };
}

/**
 * Ciclos únicos, já fechados, dentre os ids informados (ignora nulos e
 * repetidos). `cache` é opcional: sem ele cada chamada vai ao repositório,
 * que é o certo para uma ESCRITA (ler estado fresco); read-models que varrem
 * muitas parcelas passam um `criarCacheCiclos(deps)`.
 */
export async function ciclosFechadosEntre(
  deps: Deps,
  cicloIds: readonly (string | null)[],
  cache?: CacheCiclos,
): Promise<Ciclo[]> {
  const idsUnicos = [...new Set(cicloIds.filter((id): id is string => id != null))];
  const resolver = cache ?? { obter: (id: string) => deps.ciclos.obter(id) };
  const ciclos = await Promise.all(idsUnicos.map((id) => resolver.obter(id)));
  return ciclos.filter((c): c is Ciclo => c != null && c.fechado);
}

/**
 * Guarda de retroatividade (SPEC regra 9): se algum dos ciclos envolvidos na
 * operação (o de origem e/ou o de destino, quando a data muda) já está
 * fechado, exige `confirmarRetroativo`. Devolve os ciclos fechados
 * envolvidos, para recálculo de sobra após a operação.
 */
export async function exigirConfirmacaoSeRetroativo(
  deps: Deps,
  cicloIds: readonly (string | null)[],
  confirmarRetroativo: boolean,
): Promise<Ciclo[]> {
  const fechados = await ciclosFechadosEntre(deps, cicloIds);
  if (fechados.length > 0 && !confirmarRetroativo) {
    throw new CicloFechadoError(fechados.map((c) => c.id));
  }
  return fechados;
}

/**
 * Recalcula e persiste `sobraCents` de um ciclo fechado a partir do estado
 * atual das transações (SPEC regra 9). Reaproveita a mesma fórmula pura do
 * fechamento (`sobraCiclo`, em `src/domain/finance`) — nunca reimplementa.
 */
export async function recalcularSobraCicloFechado(deps: Deps, cicloId: string): Promise<void> {
  const ciclo = await deps.ciclos.obter(cicloId);
  if (!ciclo) return;

  const [transacoes, categorias] = await Promise.all([
    deps.transacoes.listarPorCiclo(cicloId),
    deps.categorias.listar(),
  ]);
  const grupos = indexarGrupoCategoria(categorias);
  const { sobraCents } = sobraCiclo({
    verbaVariavelCents: ciclo.verbaVariavelCents,
    dataFimCiclo: ciclo.dataFim,
    transacoes: paraCalculo(transacoes, grupos),
  });

  await deps.ciclos.atualizar(cicloId, { sobraCents });
}

export async function recalcularSobraDosCiclosFechados(
  deps: Deps,
  ciclosFechados: readonly Ciclo[],
): Promise<void> {
  for (const ciclo of ciclosFechados) {
    await recalcularSobraCicloFechado(deps, ciclo.id);
  }
}
