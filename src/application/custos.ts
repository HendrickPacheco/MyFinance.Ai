/**
 * Casos de uso de exclusão segura de custos fixos e provisões (TASKS-CUSTOS
 * Fase 4). Complementam `upsertCustoFixo`/`upsertProvisao` de
 * `src/application/config.ts`, que seguem sendo a porta de criação/edição.
 *
 * Regra que este arquivo não pode violar (R1 — passado é congelado): editar
 * ou excluir um `CustoFixo`/`ProvisaoAnual` NUNCA altera `Ciclo.fixosCents`
 * nem `Ciclo.provisaoMensalCents` de um ciclo já fechado — esses valores
 * foram congelados quando o ciclo nasceu e vivem só em `Ciclo`, nunca são
 * recalculados a partir do cadastro atual.
 *
 * Desativar é o caminho reversível e preferencial da UI. Excluir é
 * definitivo e recusado sempre que o dado tem histórico vinculado: a FK
 * `PagamentoFixo.custoFixoId` e a FK `Transacao.provisaoId` são `Restrict`
 * no schema, então o Postgres recusaria de qualquer jeito — a checagem
 * prévia aqui existe para dar uma mensagem acionável, não para "permitir".
 */
import type { Deps } from './deps';
import { exigirOwner } from '@/domain/auth/permissoes';
import { RestricaoDeIntegridadeError } from '@/domain/ports/repositorios';
import type { CustoFixo, ProvisaoAnual } from '@/domain/model/entidades';
import { formatBRL } from '@/shared/dinheiro';
import { recalcularCicloAtualSeVazio, type EfeitoNoCicloAtual } from './ciclos';

export type { CicloAtualResumo, EfeitoNoCicloAtual } from './ciclos';

/**
 * Lançado ao tentar excluir um custo fixo que já tem `PagamentoFixo`
 * registrado em algum ciclo. A mensagem informa quantos ciclos, para o dono
 * decidir com números em vez de adivinhar — e sugere o caminho reversível.
 */
export class CustoFixoEmUsoError extends Error {
  constructor(public readonly ciclosComPagamento: number) {
    super(
      ciclosComPagamento > 0
        ? `Este custo fixo aparece em ${ciclosComPagamento} ciclo(s) com pagamento registrado. Desative em vez de excluir.`
        : 'Este custo fixo tem registros vinculados e não pode ser excluído. Desative em vez de excluir.',
    );
    this.name = 'CustoFixoEmUsoError';
  }
}

/**
 * Lançado ao tentar excluir uma provisão com `acumuladoCents != 0`. Apagar
 * jogaria fora dinheiro já reservado — a saída é zerar/transferir o
 * acumulado (fora do escopo desta fase) e só então excluir.
 */
export class ProvisaoAcumuladaError extends Error {
  constructor(public readonly acumuladoCents: number) {
    super(
      `Esta provisão tem ${formatBRL(acumuladoCents)} acumulados. Zere ou transfira o acumulado antes de excluir.`,
    );
    this.name = 'ProvisaoAcumuladaError';
  }
}

/**
 * Lançado ao tentar excluir uma provisão com gasto (`Transacao.provisaoId`)
 * já lançado — backstop da FK Restrict quando o acumulado já foi zerado mas
 * o histórico de gasto continua existindo.
 */
export class ProvisaoEmUsoError extends Error {
  constructor() {
    super('Esta provisão tem gastos vinculados e não pode ser excluída.');
    this.name = 'ProvisaoEmUsoError';
  }
}

/** Todos os custos fixos do dono, ativos e inativos — a tela de gestão precisa dos dois. */
export async function listarCustosFixos(deps: Deps): Promise<CustoFixo[]> {
  return deps.custosFixos.listarTodos();
}

/**
 * Desativa um custo fixo (ação reversível e preferencial). Ele para de
 * entrar no cálculo de ciclos futuros a partir da próxima vez que um ciclo
 * nascer; ciclos já fechados/abertos mantêm o `fixosCents` que já tinham
 * (R1) — desativar não os recalcula.
 */
export async function desativarCustoFixo(deps: Deps, id: string): Promise<EfeitoNoCicloAtual> {
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  exigirOwner(deps.ator);

  const atual = await deps.custosFixos.obter(id);
  if (!atual) throw new Error('Custo fixo não encontrado.');

  await deps.custosFixos.salvar({ ...atual, ativo: false });
  return recalcularCicloAtualSeVazio(deps);
}

/**
 * Reativa um custo fixo desativado — o retorno de `desativarCustoFixo`.
 *
 * Existe como ação PRÓPRIA em vez de um campo do formulário de edição: o
 * `fixo-form` preserva `ativo` de propósito, para que salvar um nome ou um
 * valor nunca traga de volta, em silêncio, um custo que o dono tirou do
 * cálculo. Devolve o mesmo `EfeitoNoCicloAtual` que desativar porque o impacto
 * é simétrico — `fixosCents` muda igual nos dois sentidos, e a UI precisa
 * poder dizer isso com números em vez de adjetivos.
 */
export async function reativarCustoFixo(deps: Deps, id: string): Promise<EfeitoNoCicloAtual> {
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  exigirOwner(deps.ator);

  const atual = await deps.custosFixos.obter(id);
  if (!atual) throw new Error('Custo fixo não encontrado.');

  await deps.custosFixos.salvar({ ...atual, ativo: true });
  return recalcularCicloAtualSeVazio(deps);
}

/**
 * Exclui definitivamente um custo fixo. Recusa quando há `PagamentoFixo`
 * registrado (checagem prévia, mensagem acionável) e trata a violação de FK
 * do banco (P2003, traduzida para `RestricaoDeIntegridadeError` pelo
 * adapter) como backstop — nunca deixa o erro cru vazar para a tela.
 *
 * A checagem de existência é explícita (igual a `desativarCustoFixo` e a
 * `excluirProvisao`) em vez de deixar `custosFixos.excluir` falhar: sem ela,
 * um id inexistente vazaria o `RecursoNaoEncontradoError` interno do adapter
 * Prisma — uma classe de infraestrutura que a camada de aplicação não deveria
 * conhecer nem propagar crua para a tela.
 */
export async function excluirCustoFixo(deps: Deps, id: string): Promise<EfeitoNoCicloAtual> {
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  exigirOwner(deps.ator);

  const atual = await deps.custosFixos.obter(id);
  if (!atual) throw new Error('Custo fixo não encontrado.');

  const ciclosComPagamento = await deps.pagamentosFixos.contarPorCustoFixo(id);
  if (ciclosComPagamento > 0) throw new CustoFixoEmUsoError(ciclosComPagamento);

  try {
    await deps.custosFixos.excluir(id);
  } catch (erro) {
    if (!(erro instanceof RestricaoDeIntegridadeError)) throw erro;
    // Corrida entre a checagem acima e a exclusão: reconta para a mensagem
    // ficar correta mesmo que o pagamento tenha sido registrado nesse meio-tempo.
    throw new CustoFixoEmUsoError(await deps.pagamentosFixos.contarPorCustoFixo(id));
  }
  return recalcularCicloAtualSeVazio(deps);
}

/** Todas as provisões do dono, ativas e inativas — a tela de gestão precisa das duas. */
export async function listarProvisoes(deps: Deps): Promise<ProvisaoAnual[]> {
  return deps.provisoes.listarTodas();
}

/**
 * Desativa uma provisão (ação reversível e preferencial). Simétrica a
 * `desativarCustoFixo`: para de entrar em ciclos futuros, mas não altera o
 * que já foi congelado (R1) nem mexe no acumulado.
 */
export async function desativarProvisao(deps: Deps, id: string): Promise<EfeitoNoCicloAtual> {
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  exigirOwner(deps.ator);

  const atual = await deps.provisoes.obter(id);
  if (!atual) throw new Error('Provisão não encontrada.');

  await deps.provisoes.salvar({ ...atual, ativo: false });
  return recalcularCicloAtualSeVazio(deps);
}

/**
 * Reativa uma provisão desativada. Simétrica a `reativarCustoFixo`: volta a
 * entrar em ciclos futuros, não toca no que já foi congelado (R1) e não mexe
 * no acumulado, que seguiu existindo enquanto ela estava desativada.
 */
export async function reativarProvisao(deps: Deps, id: string): Promise<EfeitoNoCicloAtual> {
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  exigirOwner(deps.ator);

  const atual = await deps.provisoes.obter(id);
  if (!atual) throw new Error('Provisão não encontrada.');

  await deps.provisoes.salvar({ ...atual, ativo: true });
  return recalcularCicloAtualSeVazio(deps);
}

/**
 * Exclui definitivamente uma provisão. Duas recusas independentes:
 * acumulado não-zero (apagaria dinheiro já reservado) e gasto já lançado
 * contra ela (FK Restrict, tratada como backstop).
 */
export async function excluirProvisao(deps: Deps, id: string): Promise<EfeitoNoCicloAtual> {
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  exigirOwner(deps.ator);

  const atual = await deps.provisoes.obter(id);
  if (!atual) throw new Error('Provisão não encontrada.');
  if (atual.acumuladoCents !== 0) throw new ProvisaoAcumuladaError(atual.acumuladoCents);

  try {
    await deps.provisoes.excluir(id);
  } catch (erro) {
    if (erro instanceof RestricaoDeIntegridadeError) throw new ProvisaoEmUsoError();
    throw erro;
  }
  return recalcularCicloAtualSeVazio(deps);
}
