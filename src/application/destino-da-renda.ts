/**
 * Read-model de "Para onde vai a renda" (G8, TASKS-GRAFO §12).
 *
 * Orquestra e nada mais: lê o ciclo COMO ESTÁ GRAVADO (regra 3 — a verba do
 * ciclo em curso nunca é recalculada a partir da Config), lê o cadastro de
 * custos fixos e as transações do ciclo, e entrega tudo à função pura
 * `destinoDaRenda`. Nenhuma aritmética de dinheiro mora aqui (regra 4).
 *
 * SOMENTE LEITURA de verdade (D-8/D1.5): usa `lerCicloAtual`, nunca
 * `garantirCicloAtual`. Esta visão responde uma pergunta — do dono na tela ou
 * do copiloto numa conversa — e pergunta não abre ciclo no banco. Sem ciclo
 * aberto devolve `null`, e quem chama decide o que dizer.
 *
 * Escopo por dono vem inteiro de `composition.ts`: todo repositório aqui já
 * nasce amarrado ao `donoId` da sessão, e nenhum id chega do cliente.
 */
import type { DataCivil } from '@/shared/data';
import type { Categoria, Ciclo, Transacao } from '@/domain/model/entidades';
import {
  destinoDaRenda,
  formatarPeriodoCiclo,
  ROTULO_CATEGORIA_REMOVIDA,
  ROTULO_SEM_CATEGORIA,
  type DestinoDaRenda,
  type LancamentoDoCiclo,
  type LinhaCategoriaDestino,
} from '@/domain/finance';
import { lerCicloAtual } from './ciclos';
import { indexarGrupoCategoria } from './mapeamento';
import type { Deps } from './deps';

/** A linha do motor com o nome que a tela e a ferramenta mostram. */
export interface LinhaCategoriaDestinoView extends LinhaCategoriaDestino {
  nome: string;
}

export interface EstadoDestinoDaRenda {
  hoje: DataCivil;
  ciclo: Ciclo;
  periodoLabel: string;
  destino: DestinoDaRenda;
  porCategoria: readonly LinhaCategoriaDestinoView[];
  /** Categorias em que custo fixo e gasto de verba se encontram (§12.4.1). */
  categoriasComMisturaDeOrigem: readonly LinhaCategoriaDestinoView[];
}

export async function obterDestinoDaRendaSomenteLeitura(
  deps: Deps,
): Promise<EstadoDestinoDaRenda | null> {
  const resolvido = await lerCicloAtual(deps);
  if (!resolvido) return null;

  const { ciclo } = resolvido;
  const hoje = deps.relogio.hoje();
  const [custosFixos, transacoes, categorias] = await Promise.all([
    deps.custosFixos.listarAtivos(),
    deps.transacoes.listarPorCiclo(ciclo.id),
    deps.categorias.listar(),
  ]);

  const destino = destinoDaRenda({
    hoje,
    fimDoCiclo: ciclo.dataFim,
    rendaPrevistaCents: ciclo.rendaPrevistaCents,
    poupancaAlvoCents: ciclo.poupancaAlvoCents,
    fixosCents: ciclo.fixosCents,
    provisaoMensalCents: ciclo.provisaoMensalCents,
    verbaVariavelCents: ciclo.verbaVariavelCents,
    rolloverRecebidoCents: ciclo.rolloverRecebidoCents,
    puxadoDaReservaForaDaRendaCents: ciclo.puxadoDaReservaForaDaRendaCents,
    custosFixos: custosFixos.map((c) => ({
      valorCents: c.valorCents,
      categoriaId: c.categoriaId,
    })),
    lancamentos: paraLancamentos(transacoes, categorias),
  });

  const nomear = criarNomeador(categorias);
  const porCategoria = destino.porCategoria.map(nomear);

  return {
    hoje,
    ciclo,
    periodoLabel: formatarPeriodoCiclo(ciclo.dataInicio, ciclo.dataFim),
    destino,
    porCategoria,
    // Deriva da lista já nomeada em vez de nomear de novo: as duas visões
    // precisam mostrar exatamente o mesmo rótulo para a mesma categoria.
    categoriasComMisturaDeOrigem: porCategoria.filter((l) => l.misturaOrigens),
  };
}

/**
 * Traduz `Transacao` para a forma mínima do motor. O `grupoCategoria` vem do
 * join com Categoria — é ele que o motor usa para decidir o que consome verba,
 * exatamente como na tela Hoje (`paraCalculo`); aqui a forma carrega dois
 * campos a mais, `categoriaId` e `parcelamentoId`, que a decomposição precisa
 * e o cálculo do teto não.
 */
function paraLancamentos(
  transacoes: readonly Transacao[],
  categorias: readonly Categoria[],
): LancamentoDoCiclo[] {
  const grupos = indexarGrupoCategoria(categorias);

  return transacoes.map((t) => ({
    data: t.data,
    valorCents: t.valorCents,
    tipo: t.tipo,
    grupoCategoria: t.categoriaId ? (grupos.get(t.categoriaId) ?? null) : null,
    provisaoId: t.provisaoId,
    categoriaId: t.categoriaId,
    parcelamentoId: t.parcelamentoId,
  }));
}

/**
 * Nome exibível de cada linha. Categoria ausente vira "Sem categoria" (D-14:
 * o que não dá para classificar aparece, com contagem, em vez de sumir);
 * categoria que foi apagada do cadastro e ainda tem histórico apontando para
 * ela vira "Categoria removida" — o mesmo vocabulário de `agregacoes.ts`.
 */
function criarNomeador(
  categorias: readonly Categoria[],
): (linha: LinhaCategoriaDestino) => LinhaCategoriaDestinoView {
  const nomesPorId = new Map(categorias.map((c) => [c.id, c.nome]));

  return (linha) => ({
    ...linha,
    nome:
      linha.categoriaId == null
        ? ROTULO_SEM_CATEGORIA
        : (nomesPorId.get(linha.categoriaId) ?? ROTULO_CATEGORIA_REMOVIDA),
  });
}
