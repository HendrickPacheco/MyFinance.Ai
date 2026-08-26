/**
 * Concilia e persiste o RASCUNHO de uma importação de fatura (I3 do
 * `TASKS-IMPORTACAO.md`, onda 2). Orquestração pura: extrai (se ainda não
 * extraiu), carrega o que já existe no período para conciliar contra, chama
 * `conciliarFatura` — função pura já pronta, `domain/finance/importacao.ts`
 * — e grava a linha achatada de cada `ItemConciliado` via `ImportacaoRepository`.
 *
 * 🔴 Este caso de uso NUNCA grava `Transacao`, `Parcelamento` ou
 * `PagamentoFixo`. Só o rascunho. Quem grava é `confirmar.ts`, e só depois
 * que o dono confirma linha a linha (regra 7b do `CLAUDE.md`) — D-18 revista
 * em 25/08/2026 (`TASKS-IMPORTACAO.md` §15.7): mesmo o que é NOVO sem
 * ambiguidade nenhuma é confirmado um a um, nunca em bloco.
 *
 * 🔴 Zero cálculo aqui. `CASA_CUSTO_FIXO` nunca produz `alvoTipo: 'TRANSACAO'`
 * — a função pura já garante isso no tipo do `Veredito`, e este arquivo só
 * traduz o veredito para a coluna achatada, nunca reinterpreta.
 */
import { format } from 'date-fns';
import type { Deps } from '../deps';
import { exigirOwner } from '@/domain/auth/permissoes';
import { formatBRL } from '@/shared/dinheiro';
import type { DataCivil } from '@/shared/data';
import { ultimoDiaDoMes, addDias } from '@/shared/data';
import { chaveDeduplicacao, conciliarFatura } from '@/domain/finance/importacao';
import type {
  CustoFixoConciliavel,
  Faixa,
  ItemConciliado,
  LinhaRejeitada,
  ResultadoConciliacao,
  TransacaoConciliavel,
  Veredito,
} from '@/domain/finance/importacao-tipos';
import type { AlvoTipoItemImportado, Importacao, ItemImportado } from '@/domain/model/entidades';
import type { ImportacaoComItens, NovaImportacao, NovoItemImportado } from '@/domain/ports/importacao';
import { extrairItensDaFatura } from './extrair';

/** Mesma janela default de `conciliarFatura` (`domain/finance/importacao.ts`) — repetida aqui só para dimensionar a BUSCA no banco, nunca para decidir casamento (isso é só da função pura). */
const JANELA_DIAS_BUSCA = 3;

/**
 * Quantos ciclos fechados recentes buscar para depois filtrar pela janela da
 * fatura. Uma fatura cobre um mês; com a folga de 3 dias em cada borda, no
 * máximo dois ciclos mensais fechados podem se sobrepor à janela. 3 dá folga
 * sem precisar de um método de porta novo (`ultimosFechados(n)` é o que
 * `CicloRepository` oferece — não existe "listar por intervalo").
 */
const LIMITE_CICLOS_FECHADOS_CONSULTADOS = 3;

export interface EntradaConciliarImportacao {
  /** Texto já normalizado — a normalização é da infra (leitura de PDF, colagem). */
  texto: string;
  hashConteudo: string;
  /** "YYYY-MM" — competência da fatura, informada pelo dono no upload. */
  competenciaRef: string;
  origem: Importacao['origem'];
  nomeArquivo: string | null;
}

/** Contagem + valor de uma faixa, pronta para o texto que o copiloto vai ler ao dono. */
export interface ResumoDeFaixa {
  quantidade: number;
  totalCents: number;
  totalFormatado: string;
}

/** As cinco faixas de risco da §9.2/§15.7, sempre presentes (zero é um resumo válido). */
export interface ResumoPorFaixa {
  jaRegistrado: ResumoDeFaixa;
  custoFixoReconhecido: ResumoDeFaixa;
  novo: ResumoDeFaixa;
  precisaDeVoce: ResumoDeFaixa;
  ignorado: ResumoDeFaixa;
}

/**
 * Rascunho pronto para revisão. `totalGeralCents` é a soma bruta de
 * `valorCents` de TODAS as linhas devolvidas (compra, estorno, tarifa e
 * pagamento de fatura somados sem net-off — cada `valorCents` é sempre
 * positivo por construção do domínio) — existe para o teste/critério "o
 * total devolvido é a soma das linhas" e para a conferência visual contra o
 * total impresso na fatura (D-13: divergência é sinal, não erro a esconder).
 * `totalPorSinal` decompõe o mesmo total por `sinal`, que é o corte que
 * importa para o dono (quanto foi compra, quanto foi estornado).
 */
export interface RascunhoImportacaoConciliada {
  tipo: 'RASCUNHO';
  importacaoId: string;
  competenciaRef: string;
  origem: Importacao['origem'];
  resumo: ResumoPorFaixa;
  totalGeralCents: number;
  totalGeralFormatado: string;
  totalPorSinal: Record<ItemImportado['sinal'], ResumoDeFaixa>;
  /** Em ordem de `ordem` crescente — a mesma ordem da fatura original. */
  itens: ItemImportado[];
}

/**
 * A importação deste documento já foi confirmada antes (§11 camada 1). Não
 * reabre — a tela mostra o aviso em vez de oferecer importar de novo.
 */
export interface ImportacaoJaConfirmada {
  tipo: 'JA_CONFIRMADA';
  importacaoId: string;
  mensagem: string;
  quantidadeItens: number;
}

export type ResultadoImportacaoConciliada = RascunhoImportacaoConciliada | ImportacaoJaConfirmada;

// ── Janela de busca a partir da competência ────────────────────────────────

function validarCompetenciaRef(competenciaRef: string): { ano: number; mes: number } {
  if (!/^\d{4}-\d{2}$/.test(competenciaRef)) {
    throw new TypeError(`competenciaRef precisa estar em YYYY-MM, recebido: "${competenciaRef}"`);
  }
  const ano = Number(competenciaRef.slice(0, 4));
  const mes = Number(competenciaRef.slice(5, 7));
  if (mes < 1 || mes > 12) {
    throw new TypeError(`competenciaRef com mês fora de 1..12: "${competenciaRef}"`);
  }
  return { ano, mes };
}

/**
 * `[primeiroDiaDoMes - folga, últimoDiaDoMes + folga]` da competência da
 * fatura, com a mesma folga de `JANELA_DIAS_BUSCA` usada pela conciliação
 * pura para casar contra as bordas do mês (compra do dia 31 caindo na
 * fatura do mês seguinte, por exemplo).
 */
function janelaDeBuscaDaCompetencia(competenciaRef: string): { inicio: DataCivil; fim: DataCivil } {
  const { ano, mes } = validarCompetenciaRef(competenciaRef);
  const inicioMes: DataCivil = `${competenciaRef}-01`;
  const fimMes: DataCivil = `${competenciaRef}-${String(ultimoDiaDoMes(ano, mes)).padStart(2, '0')}`;
  return {
    inicio: addDias(inicioMes, -JANELA_DIAS_BUSCA),
    fim: addDias(fimMes, JANELA_DIAS_BUSCA),
  };
}

/** true se o intervalo do ciclo intersecta a janela de busca (comparação lexicográfica, SPEC 5.1). */
function cicloSobrepoeJanela(
  ciclo: { dataInicio: DataCivil; dataFim: DataCivil },
  janela: { inicio: DataCivil; fim: DataCivil },
): boolean {
  return ciclo.dataInicio <= janela.fim && ciclo.dataFim >= janela.inicio;
}

// ── Carregamento do contexto de conciliação ────────────────────────────────

interface ContextoDeConciliacao {
  transacoes: TransacaoConciliavel[];
  custosFixos: CustoFixoConciliavel[];
  pagamentosDoCiclo: { custoFixoId: string }[];
  ciclosFechados: { dataInicio: DataCivil; dataFim: DataCivil }[];
}

/**
 * Carrega, a partir dos repositórios já presentes em `Deps`, tudo que
 * `conciliarFatura` precisa para conciliar o período da fatura: transações
 * do intervalo, custos fixos ativos, ciclos fechados que se sobrepõem à
 * janela e os pagamentos de custo fixo desses ciclos (mais o ciclo aberto
 * atual, se ele também cair na janela — uma fatura do mês corrente concilia
 * contra o ciclo em andamento, não só contra os já fechados).
 */
async function carregarContextoDeConciliacao(deps: Deps, competenciaRef: string): Promise<ContextoDeConciliacao> {
  const janela = janelaDeBuscaDaCompetencia(competenciaRef);

  const [transacoesDoPeriodo, custosFixosAtivos, ciclosFechadosRecentes, cicloAtual] = await Promise.all([
    deps.transacoes.listarPorIntervalo(janela.inicio, janela.fim),
    deps.custosFixos.listarAtivos(),
    deps.ciclos.ultimosFechados(LIMITE_CICLOS_FECHADOS_CONSULTADOS),
    deps.ciclos.obterAtual(deps.relogio.hoje()),
  ]);

  const ciclosFechados = ciclosFechadosRecentes.filter((ciclo) => cicloSobrepoeJanela(ciclo, janela));
  const ciclosParaPagamentos = [
    ...ciclosFechados,
    ...(cicloAtual && cicloSobrepoeJanela(cicloAtual, janela) ? [cicloAtual] : []),
  ];
  const pagamentosPorCiclo = await Promise.all(
    ciclosParaPagamentos.map((ciclo) => deps.pagamentosFixos.listarPorCiclo(ciclo.id)),
  );

  return {
    transacoes: transacoesDoPeriodo.map((t) => ({
      id: t.id,
      data: t.data,
      valorCents: t.valorCents,
      descricao: t.descricao,
      parcelamentoId: t.parcelamentoId,
      parcelaNum: t.parcelaNum,
    })),
    custosFixos: custosFixosAtivos.map((c) => ({
      id: c.id,
      nome: c.nome,
      valorCents: c.valorCents,
      diaVencimento: c.diaVencimento,
    })),
    pagamentosDoCiclo: pagamentosPorCiclo.flat().map((p) => ({ custoFixoId: p.custoFixoId })),
    ciclosFechados: ciclosFechados.map((c) => ({ dataInicio: c.dataInicio, dataFim: c.dataFim })),
  };
}

// ── Tradução do veredito para a linha achatada de persistência ─────────────

/**
 * `alvoTipo`/`alvoId` só existem para os dois vereditos que apontam para
 * algo já existente. 🔴 `CASA_CUSTO_FIXO` aponta para `CUSTO_FIXO`, nunca
 * para `TRANSACAO` — é o R1 do plano, garantido aqui pelo próprio tipo
 * discriminado de `Veredito` (não tem como este switch devolver `TRANSACAO`
 * para um `CASA_CUSTO_FIXO`, o compilador barra).
 */
function alvoDoVeredito(veredito: Veredito): { alvoTipo: AlvoTipoItemImportado | null; alvoId: string | null } {
  switch (veredito.tipo) {
    case 'CASA_PARCELA':
    case 'CASA_VARIAVEL':
      return { alvoTipo: 'TRANSACAO', alvoId: veredito.transacaoId };
    case 'CASA_CUSTO_FIXO':
      return { alvoTipo: 'CUSTO_FIXO', alvoId: veredito.custoFixoId };
    case 'NOVA_AVULSA':
    case 'NOVA_PARCELA_ORFA':
    case 'AMBIGUA':
    case 'IGNORAR':
      return { alvoTipo: null, alvoId: null };
  }
}

/** Uma linha achatada + a faixa exata que `conciliarFatura` calculou para ela. */
interface LinhaParaPersistir {
  novo: NovoItemImportado;
  faixa: Faixa;
}

function paraLinhaConciliada(itemConciliado: ItemConciliado): LinhaParaPersistir {
  const { item, veredito, faixa, chaveDedup } = itemConciliado;
  const { alvoTipo, alvoId } = alvoDoVeredito(veredito);
  return {
    faixa,
    novo: {
      ordem: item.ordem,
      descricaoOriginal: item.descricaoOriginal,
      valorCents: item.valorCents,
      sinal: item.sinal,
      data: item.data,
      dataOriginalTexto: item.dataOriginalTexto,
      parcelaAtual: item.parcela?.atual ?? null,
      parcelaTotal: item.parcela?.total ?? null,
      confianca: item.confianca,
      veredito: veredito.tipo,
      vereditoMotivo: veredito.motivo,
      alvoTipo,
      alvoId,
      chaveDedup,
    },
  };
}

/**
 * Linha que a conciliação pura recusou a interpretar (valor não-inteiro,
 * data irresolúvel — `motivoRejeicao` em `domain/finance/importacao.ts`).
 * Grava com o veredito `REJEITADA` (`model/enums.ts`), que existe só na
 * persistência: `conciliarFatura` nunca o emite. Ela cai em
 * `PRECISA_DE_VOCE`, que é onde o dono precisa ver a linha, com o motivo em
 * texto (D-14) — em vez de sumir da importação, ou de se disfarçar de
 * `AMBIGUA` e misturar "o dono escolhe" com "o extrator errou".
 */
function paraLinhaRejeitada(rejeitada: LinhaRejeitada): LinhaParaPersistir {
  const { item, motivo } = rejeitada;
  return {
    faixa: 'PRECISA_DE_VOCE',
    novo: {
      ordem: item.ordem,
      descricaoOriginal: item.descricaoOriginal,
      valorCents: item.valorCents,
      sinal: item.sinal,
      data: item.data,
      dataOriginalTexto: item.dataOriginalTexto,
      parcelaAtual: item.parcela?.atual ?? null,
      parcelaTotal: item.parcela?.total ?? null,
      confianca: item.confianca,
      veredito: 'REJEITADA',
      vereditoMotivo: motivo,
      alvoTipo: null,
      alvoId: null,
      chaveDedup: chaveDeduplicacao(item),
    },
  };
}

/** Todas as linhas da conciliação (aceitas + rejeitadas), na ordem original da fatura. */
function todasAsLinhas(conciliacao: ResultadoConciliacao): LinhaParaPersistir[] {
  const linhas = [
    ...conciliacao.itens.map(paraLinhaConciliada),
    ...conciliacao.rejeitadas.map(paraLinhaRejeitada),
  ];
  return linhas.sort((a, b) => a.novo.ordem - b.novo.ordem);
}

// ── Resumo por faixa e totais ───────────────────────────────────────────────

const FAIXAS_VAZIAS = (): Record<Faixa, { quantidade: number; totalCents: number }> => ({
  JA_REGISTRADO: { quantidade: 0, totalCents: 0 },
  CUSTO_FIXO_RECONHECIDO: { quantidade: 0, totalCents: 0 },
  NOVO: { quantidade: 0, totalCents: 0 },
  PRECISA_DE_VOCE: { quantidade: 0, totalCents: 0 },
  IGNORADO: { quantidade: 0, totalCents: 0 },
});

function paraResumoDeFaixa(grupo: { quantidade: number; totalCents: number }): ResumoDeFaixa {
  return { quantidade: grupo.quantidade, totalCents: grupo.totalCents, totalFormatado: formatBRL(grupo.totalCents) };
}

function resumirPorFaixa(linhas: readonly { faixa: Faixa; valorCents: number }[]): ResumoPorFaixa {
  const grupos = FAIXAS_VAZIAS();
  for (const linha of linhas) {
    const grupo = grupos[linha.faixa];
    grupo.quantidade += 1;
    grupo.totalCents += linha.valorCents;
  }
  return {
    jaRegistrado: paraResumoDeFaixa(grupos.JA_REGISTRADO),
    custoFixoReconhecido: paraResumoDeFaixa(grupos.CUSTO_FIXO_RECONHECIDO),
    novo: paraResumoDeFaixa(grupos.NOVO),
    precisaDeVoce: paraResumoDeFaixa(grupos.PRECISA_DE_VOCE),
    ignorado: paraResumoDeFaixa(grupos.IGNORADO),
  };
}

const SINAIS: readonly ItemImportado['sinal'][] = ['COMPRA', 'ESTORNO', 'TARIFA', 'PAGAMENTO_FATURA'];

function resumirPorSinal(
  linhas: readonly { sinal: ItemImportado['sinal']; valorCents: number }[],
): Record<ItemImportado['sinal'], ResumoDeFaixa> {
  const grupos: Record<ItemImportado['sinal'], { quantidade: number; totalCents: number }> = {
    COMPRA: { quantidade: 0, totalCents: 0 },
    ESTORNO: { quantidade: 0, totalCents: 0 },
    TARIFA: { quantidade: 0, totalCents: 0 },
    PAGAMENTO_FATURA: { quantidade: 0, totalCents: 0 },
  };
  for (const linha of linhas) {
    const grupo = grupos[linha.sinal];
    grupo.quantidade += 1;
    grupo.totalCents += linha.valorCents;
  }
  return Object.fromEntries(SINAIS.map((sinal) => [sinal, paraResumoDeFaixa(grupos[sinal])])) as Record<
    ItemImportado['sinal'],
    ResumoDeFaixa
  >;
}

function totalGeral(linhas: readonly { valorCents: number }[]): { totalGeralCents: number; totalGeralFormatado: string } {
  const totalGeralCents = linhas.reduce((soma, linha) => soma + linha.valorCents, 0);
  return { totalGeralCents, totalGeralFormatado: formatBRL(totalGeralCents) };
}

// ── Faixa aproximada para um rascunho já persistido (idempotência, §11 camada 1) ─

/**
 * Réplica minimalista de `faixaBaseDoTipo` (privada em
 * `domain/finance/importacao.ts`) sobre os campos JÁ PERSISTIDOS de
 * `ItemImportado` — usada só quando o hash já existe e não há nada a
 * reconciliar de novo (§11 camada 1: "rascunho volta como está").
 *
 * Limitação conhecida e aceita: a promoção por ciclo fechado
 * (`ItemConciliado.retroativa`) NÃO é persistida em `ItemImportado` — não há
 * coluna para isso no schema desta fase — então, ao reabrir um rascunho já
 * existente, uma linha que nasceu `PRECISA_DE_VOCE` por retroatividade e
 * teria, sem essa promoção, caído em `NOVO`/`CUSTO_FIXO_RECONHECIDO`
 * permanece corretamente marcada (o `veredito` persistido já reflete a
 * decisão original — só o AGRUPAMENTO por faixa é recalculado aqui, de forma
 * aproximada). Registrado como dívida para uma migração futura que adicione
 * `retroativa Boolean` a `ItemImportado`, se isso se mostrar necessário na
 * prática.
 */
export function faixaAproximadaDoItemPersistido(item: ItemImportado): Faixa {
  switch (item.veredito) {
    case 'CASA_PARCELA':
    case 'CASA_VARIAVEL':
      return 'JA_REGISTRADO';
    case 'CASA_CUSTO_FIXO':
      return 'CUSTO_FIXO_RECONHECIDO';
    case 'NOVA_AVULSA':
      return item.sinal === 'TARIFA' ? 'PRECISA_DE_VOCE' : 'NOVO';
    case 'NOVA_PARCELA_ORFA':
    case 'AMBIGUA':
    // Linha que a conciliação não soube ler: o dono precisa vê-la com o
    // motivo, e é a única faixa que a mostra.
    case 'REJEITADA':
      return 'PRECISA_DE_VOCE';
    case 'IGNORAR':
      return 'IGNORADO';
  }
}

function formatarDataCurtaDoConfirmadaEm(confirmadaEm: Date | null): string {
  // `confirmadaEm` é um carimbo `DateTime` (regra 2 do CLAUDE.md libera Date
  // para createdAt/confirmadaEm — não é data civil de gasto), então formatar
  // via `date-fns` direto é seguro aqui; não é o `new Date(string)` que a
  // regra proíbe para datas civis.
  return confirmadaEm ? format(confirmadaEm, 'dd/MM') : 'data desconhecida';
}

function mensagemJaConfirmada(existente: ImportacaoComItens): string {
  const dataFormatada = formatarDataCurtaDoConfirmadaEm(existente.importacao.confirmadaEm);
  const { totalGeralCents } = totalGeral(existente.itens);
  return (
    `Esta fatura já foi importada em ${dataFormatada} · ${existente.itens.length} lançamento(s) · ` +
    `${formatBRL(totalGeralCents)}.`
  );
}

function montarRascunhoDeItensExistentes(existente: ImportacaoComItens): RascunhoImportacaoConciliada {
  const linhas = existente.itens.map((item) => ({ faixa: faixaAproximadaDoItemPersistido(item), ...item }));
  return {
    tipo: 'RASCUNHO',
    importacaoId: existente.importacao.id,
    competenciaRef: existente.importacao.competenciaRef,
    origem: existente.importacao.origem,
    resumo: resumirPorFaixa(linhas),
    ...totalGeral(existente.itens),
    totalPorSinal: resumirPorSinal(existente.itens),
    itens: existente.itens,
  };
}

// ── Caso de uso ──────────────────────────────────────────────────────────────

/**
 * Concilia uma fatura já transcrita (ou ainda por transcrever, se o hash for
 * inédito) e persiste o rascunho. Idempotente em duas camadas próprias deste
 * caso de uso (as outras da §11 vivem em `confirmar.ts` e no schema):
 *
 * 1. Hash já visto e `status === 'CONFIRMADA'` → devolve o aviso, não reabre.
 * 2. Hash já visto e `status` é `RASCUNHO`/`DESCARTADA` → devolve o rascunho
 *    tal como está, SEM re-extrair (a extração custa tokens e ~40s). Reenviar
 *    a mesma fatura descartada reabre a mesma leitura em vez de criar um
 *    segundo rascunho — o schema não permitiria de qualquer forma
 *    (`Importacao @@unique([donoId, hashConteudo])`), e a porta não tem uma
 *    operação de "reabrir": mostrar de novo os itens já decididos é
 *    inofensivo, porque este caso de uso nunca grava `Transacao`.
 */
export async function conciliarImportacao(
  deps: Deps,
  entrada: EntradaConciliarImportacao,
): Promise<ResultadoImportacaoConciliada> {
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  exigirOwner(deps.ator);

  const existente = await deps.importacoes.obterPorHash(entrada.hashConteudo);
  if (existente) {
    if (existente.importacao.status === 'CONFIRMADA') {
      return {
        tipo: 'JA_CONFIRMADA',
        importacaoId: existente.importacao.id,
        mensagem: mensagemJaConfirmada(existente),
        quantidadeItens: existente.itens.length,
      };
    }
    return montarRascunhoDeItensExistentes(existente);
  }

  const [extracao, contexto] = await Promise.all([
    extrairItensDaFatura(deps, { texto: entrada.texto, competenciaRef: entrada.competenciaRef }),
    carregarContextoDeConciliacao(deps, entrada.competenciaRef),
  ]);

  const conciliacao = conciliarFatura({
    itens: extracao.itens,
    transacoes: contexto.transacoes,
    custosFixos: contexto.custosFixos,
    pagamentosDoCiclo: contexto.pagamentosDoCiclo,
    ciclosFechados: contexto.ciclosFechados,
  });

  const linhas = todasAsLinhas(conciliacao);

  const novaImportacao: NovaImportacao = {
    origem: entrada.origem,
    nomeArquivo: entrada.nomeArquivo,
    hashConteudo: entrada.hashConteudo,
    competenciaRef: entrada.competenciaRef,
    tokensEntrada: extracao.consumo.entrada,
    tokensSaida: extracao.consumo.saida,
    itens: linhas.map((linha) => linha.novo),
  };

  const rascunho = await deps.importacoes.criarRascunho(novaImportacao);

  return {
    tipo: 'RASCUNHO',
    importacaoId: rascunho.importacao.id,
    competenciaRef: rascunho.importacao.competenciaRef,
    origem: rascunho.importacao.origem,
    resumo: resumirPorFaixa(linhas.map((linha) => ({ faixa: linha.faixa, valorCents: linha.novo.valorCents }))),
    ...totalGeral(linhas.map((linha) => linha.novo)),
    totalPorSinal: resumirPorSinal(linhas.map((linha) => linha.novo)),
    itens: rascunho.itens,
  };
}
