/**
 * "Para onde vai a renda" (G8, TASKS-GRAFO §12) — a decomposição da renda do
 * ciclo em blocos que fecham EXATAMENTE em 100% dela.
 *
 * Esta é uma pergunta DIFERENTE da que o resto do app responde. As telas Hoje,
 * Ciclo e Análise perguntam "quanto posso gastar hoje?" e por isso filtram
 * `grupo === 'VARIAVEL'` — custo fixo já está comprometido e misturá-lo com
 * verba variável é a regra 5. Aqui a pergunta é "para onde vai minha renda?",
 * e a resposta honesta inclui tudo. Nada neste arquivo afrouxa aquele filtro:
 * ele é uma visão separada, não uma mudança nas existentes.
 *
 * ─── 🔴 D-11: PARCELA NÃO É BLOCO DE TOPO ───
 *
 * Cada parcela é uma `Transacao` de grupo VARIAVEL e CONSOME o teto diário
 * como qualquer outro gasto — ela NÃO é deduzida no cálculo da verba
 * (`verbaVariavelCents`, verba.ts). Promover "Parcelamentos" ao lado de
 * "Custos fixos" contaria o mesmo dinheiro duas vezes e estouraria a soma da
 * renda. Por isso `parcelamentosDoCiclo` é SUBDIVISÃO de "Disponível para
 * gastar", nunca um `BlocoDaRenda`. O tipo impede o erro: `ChaveBlocoDaRenda`
 * não tem o membro.
 *
 * ─── 🔴 RÓTULOS (§12.2.1) ───
 *
 * "Variável" tem dois sentidos que se atropelam: o motor chama de
 * `verbaVariavel` o BALDE, o dono chama de "gasto variável" o GASTO EVENTUAL.
 * Os rótulos exibíveis vivem em `ROTULO_BLOCO`/`ROTULO_SUBDIVISAO` e são os
 * únicos que podem chegar ao dono — `verbaVariavel` e `verbaLivre` continuam
 * sendo nomes internos.
 *
 * ─── 🔴 ORIGEM DE CADA PARCELA DO TOTAL (§12.4.1, D-15) ───
 *
 * Um `CustoFixo` pode carregar categoria de grupo VARIAVEL (ex.: "Mercado"),
 * a mesma em que caem gastos de verba. Agregar por `categoriaId` sem dizer de
 * onde veio cada pedaço produziria um número que não é gasto de verba nem
 * custo fixo — a mistura que a regra 5 proíbe, invisível porque o `grupo`
 * some no caminho. Por isso `LinhaCategoriaDestino` NUNCA tem só um total:
 * ela carrega `partes` e `quantidade` por origem, e `misturaOrigens` marca a
 * linha em que isso importa.
 */
import { assertData, type DataCivil } from '@/shared/data';
import { assertCentavos } from '@/shared/dinheiro';
import { contaComoVerbaVariavel } from './teto';
import { gastoVariavelSemParcelasCents, somarParceladosCents } from './agregacoes';
import { SEM_CATEGORIA_ID } from './sem-categoria';
import type { TransacaoCalc } from './tipos';

export type ChaveBlocoDaRenda =
  | 'POUPANCA'
  | 'CUSTOS_FIXOS'
  | 'PROVISAO'
  | 'AJUSTE_ROLLOVER'
  | 'PUXADA_DA_RESERVA'
  | 'DISPONIVEL_PARA_GASTAR'
  | 'NAO_EXPLICADO';

export type ChaveSubdivisaoDoDisponivel = 'PARCELAMENTOS_DO_CICLO' | 'GASTOS_EVENTUAIS_DO_MES';

/** Os rótulos fixados com o dono em 24/08/2026 (§12.2.1). */
export const ROTULO_BLOCO = {
  POUPANCA: 'Poupança (meta)',
  CUSTOS_FIXOS: 'Custos fixos',
  PROVISAO: 'Provisão mensal',
  AJUSTE_ROLLOVER: 'Ajuste de rollover',
  PUXADA_DA_RESERVA: 'Puxada da reserva',
  DISPONIVEL_PARA_GASTAR: 'Disponível para gastar',
  NAO_EXPLICADO: 'Diferença não explicada',
} as const satisfies Record<ChaveBlocoDaRenda, string>;

/**
 * Por que um bloco aparece com sinal invertido. Sem esta frase o dono lê
 * "Puxada da reserva −R$ 500,00" e entende que perdeu R$ 500 — quando o que
 * aconteceu foi o contrário: ele ganhou R$ 500 de disponível, vindos da
 * reserva. O sinal é da IDENTIDADE (a soma tem que fechar na renda), não do
 * bolso.
 */
export const NOTA_BLOCO: Partial<Record<ChaveBlocoDaRenda, string>> = {
  PUXADA_DA_RESERVA:
    'Este dinheiro está no seu disponível mas não veio desta renda — ele saiu da sua ' +
    'reserva. Entra com sinal negativo para os blocos continuarem somando exatamente a ' +
    'renda do ciclo; você não perdeu nada aqui. Se você puxou mais do que isto, a ' +
    'diferença foi coberta reduzindo a meta de poupança, e já aparece no bloco ' +
    '"Poupança (meta)" mais baixo.',
};

export const ROTULO_SUBDIVISAO = {
  PARCELAMENTOS_DO_CICLO: 'Parcelamentos do ciclo',
  GASTOS_EVENTUAIS_DO_MES: 'Gastos eventuais do mês',
} as const satisfies Record<ChaveSubdivisaoDoDisponivel, string>;

export type OrigemDoDestino = 'CUSTO_FIXO' | 'PARCELAMENTO' | 'GASTO_EVENTUAL';

/** Um custo fixo ativo, reduzido ao que a decomposição precisa saber. */
export interface CustoFixoDoCiclo {
  valorCents: number;
  categoriaId: string | null;
}

/** Uma transação do ciclo, com o que separa parcela de gasto eventual. */
export interface LancamentoDoCiclo extends TransacaoCalc {
  categoriaId: string | null;
  /** Preenchido = parcela de `Parcelamento` (D-11: consome o teto, não a verba). */
  parcelamentoId: string | null;
}

/**
 * O ciclo COMO ESTÁ GRAVADO (regra 3 — verba congelada). Nada aqui é
 * recalculado a partir da Config: o dono precisa ver o ciclo que ele tem, não
 * o que ele teria se tivesse nascido hoje.
 */
export interface EntradaDestinoDaRenda {
  hoje: DataCivil;
  fimDoCiclo: DataCivil;

  rendaPrevistaCents: number;
  poupancaAlvoCents: number;
  fixosCents: number;
  provisaoMensalCents: number;
  /** A verba GRAVADA. Fonte de verdade — não é recomposta pelas partes. */
  verbaVariavelCents: number;
  rolloverRecebidoCents: number;
  /**
   * A parte do que foi puxado da reserva que ESTA RENDA não explica (saída (b)
   * do modo recuperação, SPEC 5.4). Dinheiro REAL, com lastro: saiu da conta de
   * reserva e entrou na variável.
   *
   * Não é o bruto puxado. A parte da puxada coberta pela redução da
   * poupança-alvo já está declarada — é o bloco "Poupança (meta)" menor —, e
   * contá-la de novo aqui derrubaria a identidade no caso em que ela fechava.
   */
  puxadoDaReservaForaDaRendaCents: number;

  /** Custos fixos ATIVOS hoje. Podem já não bater com `fixosCents` — ver `ResumoCustosFixos`. */
  custosFixos: readonly CustoFixoDoCiclo[];
  /** Todas as transações do ciclo, sem pré-filtro: a classificação é regra e mora aqui. */
  lancamentos: readonly LancamentoDoCiclo[];
}

/**
 * Um percentual que pode não existir. `valor: null` não é falha: é o caso em
 * que a base é zero ou negativa e QUALQUER número seria mentira — e, pela
 * D-14, ele viaja com o motivo, porque um `null` mudo faz o copiloto (e o
 * dono) inventar a causa.
 */
export interface RazaoPercentual {
  /** 0–100 com uma casa decimal, ou `null` quando a base não comporta razão. */
  valor: number | null;
  motivo: string | null;
}

export interface BlocoDaRenda {
  chave: ChaveBlocoDaRenda;
  rotulo: string;
  /** Pode ser negativo — `AJUSTE_ROLLOVER` e `PUXADA_DA_RESERVA` são os casos normais disso. */
  valorCents: number;
  percentualDaRenda: RazaoPercentual;
  /** Por que este bloco tem o sinal que tem, quando o sinal engana. */
  nota: string | null;
}

export interface SubdivisaoDoDisponivel {
  chave: ChaveSubdivisaoDoDisponivel;
  rotulo: string;
  valorCents: number;
  percentualDaRenda: RazaoPercentual;
  percentualDoDisponivel: RazaoPercentual;
}

/**
 * Uma categoria com o total E as partes que o compõem. As partes são o ponto
 * (§12.4.1): sem elas, "Mercado R$ 2.000" não diz se é compra de verba, custo
 * fixo classificado ali, ou os dois somados.
 */
export interface LinhaCategoriaDestino {
  /** `null` = sem categoria cadastrada. */
  categoriaId: string | null;
  totalCents: number;
  partes: {
    custoFixoCents: number;
    parcelamentoCents: number;
    gastoEventualRealizadoCents: number;
    gastoEventualProgramadoCents: number;
  };
  quantidade: {
    custosFixos: number;
    parcelas: number;
    /** Total de gastos eventuais = realizados + programados. */
    gastosEventuais: number;
    /** Separados porque cada contagem rotula um valor diferente: somar as duas
     * num rótulo só faz "Gasto eventual (2) R$ 200,00" descrever duas
     * transações que somariam R$ 500. */
    gastosEventuaisRealizados: number;
    gastosEventuaisProgramados: number;
  };
  /** As origens que de fato contribuíram (parte != 0 ou contagem > 0). */
  origens: readonly OrigemDoDestino[];
  /**
   * 🔴 Custo fixo encontrando gasto de VERBA na mesma categoria — e SÓ isso.
   *
   * É o perigo exato da §12.4.1: o total vira um número que não é gasto de
   * verba nem custo fixo, e o `grupo` que separaria os dois some na agregação
   * por `categoriaId`.
   *
   * Parcela + gasto eventual NÃO é mistura. Ambos são `Transacao` de grupo
   * VARIAVEL que consomem o mesmo teto diário (D-11), então somá-los é
   * literalmente o gasto de verba da categoria. Marcar esse caso disparava o
   * alarme em quase toda categoria (o dono tem 13 parcelamentos ativos) e
   * afogava o caso real no ruído.
   */
  misturaOrigens: boolean;
}

/**
 * O bloco "Custos fixos" vale o `fixosCents` CONGELADO no ciclo; o
 * detalhamento por categoria vale o cadastro de HOJE. Os dois divergem sempre
 * que um custo fixo foi criado, alterado ou desativado depois de o ciclo
 * nascer — e a divergência é informação, não erro a esconder (D-13/D-14).
 */
export interface ResumoCustosFixos {
  congeladoNoCicloCents: number;
  cadastradosHojeCents: number;
  /** `cadastradosHoje − congeladoNoCiclo`. Zero = cadastro intacto desde a abertura. */
  diferencaCents: number;
  motivoDiferenca: string | null;
  quantidadeCadastrada: number;
  semCategoria: { quantidade: number; totalCents: number };
}

export interface DisponivelParaGastar {
  totalCents: number;
  subdivisoes: readonly SubdivisaoDoDisponivel[];
  /** Compromisso já assumido: as parcelas com competência neste ciclo. */
  parcelamentosDoCicloCents: number;
  /** Orçamento de escolha do mês — o número que responde "quanto posso gastar sem me enrolar". */
  gastosEventuaisDoMesCents: number;
  /** Contra esse orçamento: o que já saiu até hoje. */
  realizadoAteHojeCents: number;
  /** Competência futura já lançada no ciclo: ainda não consome teto (SPEC 5.1). */
  programadoNoCicloCents: number;
  /** `gastosEventuaisDoMes − realizado − programado`. Negativo = orçamento estourado. */
  aindaSemDestinoCents: number;
}

export interface DestinoDaRenda {
  rendaDoCicloCents: number;
  /** Fecham em 100% da renda, sempre — `NAO_EXPLICADO` existe para isso. */
  blocos: readonly BlocoDaRenda[];
  somaDosBlocosCents: number;
  naoExplicadoCents: number;
  motivoNaoExplicado: string | null;

  disponivelParaGastar: DisponivelParaGastar;
  custosFixos: ResumoCustosFixos;

  /** União das três origens, ordenada por total desc. Cada linha carrega suas partes. */
  porCategoria: readonly LinhaCategoriaDestino[];
  /** Categorias em que custo fixo e gasto de verba se encontram (§12.4.1). */
  categoriasComMisturaDeOrigem: readonly LinhaCategoriaDestino[];
}

/**
 * A rede de segurança (D-14). "Puxar da reserva" saiu desta lista quando ganhou
 * bloco próprio — o que sobra aqui é o que ninguém antecipou. A porta conhecida
 * que resta é a carga de backup: `infrastructure/backup.ts` valida cada campo
 * do ciclo isoladamente e não tem invariante cruzada, então um arquivo editado
 * à mão entra com números que não fecham entre si.
 */
const MOTIVO_NAO_EXPLICADO =
  'A soma das partes gravadas no ciclo não fecha com a renda gravada, e nenhuma das ' +
  'fontes externas conhecidas (rollover herdado, puxada da reserva) explica a ' +
  'diferença — as duas já têm bloco próprio acima. Sobra o caso de o ciclo ter sido ' +
  'gravado com números inconsistentes: uma carga de backup com valores editados fora ' +
  'do app é a porta aberta, porque o import valida cada campo isoladamente e não ' +
  'confere a soma. A diferença está exposta aqui em vez de ser absorvida em outro ' +
  'bloco: nenhum número foi alterado para forçar o fechamento.';

const MOTIVO_BASE_ZERO =
  'Não há percentual: a base é zero, e nada é fração de zero.';

const MOTIVO_BASE_NEGATIVA =
  'Não há percentual: a base é negativa (o disponível do ciclo ficou abaixo de zero, ' +
  'o que é legítimo em modo recuperação). Um percentual sobre base negativa sai com o ' +
  'sinal trocado e faz um valor grande parecer pequeno.';

const MOTIVO_CUSTOS_FIXOS_DIVERGENTES =
  'O bloco vale o valor CONGELADO quando o ciclo nasceu (regra 3); o detalhamento por ' +
  'categoria vale o cadastro de hoje. A diferença é custo fixo criado, alterado ou ' +
  'desativado no meio do ciclo — o ciclo em curso não é recalculado por isso.';

/**
 * `parteCents` como percentual de `baseCents`, uma casa decimal.
 *
 * A base NÃO é sempre a renda — também é o "disponível para gastar", que pode
 * ser negativo por construção (modo recuperação, `verba.ts`). Por isso o nome
 * é genérico: chamar tudo de `percentualDaRenda` fez a subdivisão de
 * parcelamentos ser dividida pelo disponível sob o rótulo errado.
 *
 * Base zero ou negativa devolve `null` COM MOTIVO (D-14), nunca um `0` mudo:
 * com disponível negativo, o `0` imprimia "Parcelamentos do ciclo · 0% do
 * disponível" ao lado de R$ 4.393,88. É número DERIVADO — quem decide é o
 * centavo.
 */
export function razaoPercentual(parteCents: number, baseCents: number): RazaoPercentual {
  if (baseCents === 0) return { valor: null, motivo: MOTIVO_BASE_ZERO };
  if (baseCents < 0) return { valor: null, motivo: MOTIVO_BASE_NEGATIVA };
  return { valor: Math.round((parteCents / baseCents) * 1000) / 10, motivo: null };
}

/**
 * A decomposição completa. Função pura: recebe o ciclo congelado + o cadastro
 * + os lançamentos, devolve números. Não lê relógio, não toca banco.
 */
export function destinoDaRenda(entrada: EntradaDestinoDaRenda): DestinoDaRenda {
  assertData(entrada.hoje, 'hoje');
  assertData(entrada.fimDoCiclo, 'fimDoCiclo');
  const renda = assertCentavos(entrada.rendaPrevistaCents, 'rendaPrevistaCents');
  assertCentavos(entrada.poupancaAlvoCents, 'poupancaAlvoCents');
  assertCentavos(entrada.fixosCents, 'fixosCents');
  assertCentavos(entrada.provisaoMensalCents, 'provisaoMensalCents');
  assertCentavos(entrada.verbaVariavelCents, 'verbaVariavelCents');
  assertCentavos(entrada.rolloverRecebidoCents, 'rolloverRecebidoCents');
  assertCentavos(entrada.puxadoDaReservaForaDaRendaCents, 'puxadoDaReservaForaDaRendaCents');

  const disponivelParaGastar = subdividirDisponivel(entrada, renda);
  const { blocos, somaDosBlocosCents, naoExplicadoCents } = montarBlocos(entrada, renda);
  const porCategoria = agregarPorCategoria(entrada);

  return {
    rendaDoCicloCents: renda,
    blocos,
    somaDosBlocosCents,
    naoExplicadoCents,
    motivoNaoExplicado: naoExplicadoCents === 0 ? null : MOTIVO_NAO_EXPLICADO,
    disponivelParaGastar,
    custosFixos: resumirCustosFixos(entrada),
    porCategoria,
    categoriasComMisturaDeOrigem: porCategoria.filter((linha) => linha.misturaOrigens),
  };
}

/**
 * Os blocos de topo.
 *
 * DUAS FONTES EXTERNAS entram INVERTIDAS, e isso não é engano — é o que faz a
 * identidade fechar. Um rollover recebido de +R$ 500 aumenta o disponível sem
 * ter vindo da renda deste ciclo, então aparece como −R$ 500. Rollover
 * negativo (sobra negativa herdada) entra positivo, porque de fato consumiu
 * renda deste ciclo.
 *
 * 🔴 A PUXADA DA RESERVA segue a mesma regra, e é a razão de este bloco
 * existir. `puxarDaReserva` (application/ciclos.ts) soma X à verba e reduz a
 * poupança-alvo em X COM PISO EM ZERO. Enquanto a poupança comporta X, os dois
 * movimentos se cancelam e a identidade fecha sozinha — o bloco entra zerado,
 * porque nada veio de fora: o disponível cresceu com dinheiro que esta renda ia
 * poupar, e isso já está declarado no bloco "Poupança (meta)" menor.
 *
 * Quando a poupança NÃO comporta X, a verba sobe mais do que a poupança desce e
 * a soma passa da renda em `X − poupançaAlvo`. É exatamente esse excedente que
 * `puxadoDaReservaForaDaRendaCents` guarda — e é por isso que ele não é o valor
 * bruto puxado. O excedente tem lastro: é dinheiro real que saiu da conta de
 * reserva e entrou na variável, e não veio desta renda, como o rollover. Com
 * bloco próprio ele é declarado; sem ele, virava "diferença não explicada"
 * negativa, como se o app tivesse perdido a conta.
 */
/**
 * Troca o sinal preservando o zero POSITIVO. `-0` é igual a `0` em toda
 * aritmética, mas `Object.is(-0, 0)` é falso — e é `Object.is` que compara em
 * `toBe`, em `===` de memo e em qualquer chave de igualdade. Um bloco zerado
 * não pode depender de qual lado da identidade o produziu.
 */
function inverter(valorCents: number): number {
  return valorCents === 0 ? 0 : -valorCents;
}

function montarBlocos(
  entrada: EntradaDestinoDaRenda,
  renda: number,
): { blocos: BlocoDaRenda[]; somaDosBlocosCents: number; naoExplicadoCents: number } {
  const valores: [ChaveBlocoDaRenda, number][] = [
    ['POUPANCA', entrada.poupancaAlvoCents],
    ['CUSTOS_FIXOS', entrada.fixosCents],
    ['PROVISAO', entrada.provisaoMensalCents],
    ['AJUSTE_ROLLOVER', inverter(entrada.rolloverRecebidoCents)],
    ['PUXADA_DA_RESERVA', inverter(entrada.puxadoDaReservaForaDaRendaCents)],
    ['DISPONIVEL_PARA_GASTAR', entrada.verbaVariavelCents],
  ];

  const somaDeclarada = valores.reduce((total, [, valor]) => total + valor, 0);
  const naoExplicadoCents = renda - somaDeclarada;
  if (naoExplicadoCents !== 0) valores.push(['NAO_EXPLICADO', naoExplicadoCents]);

  return {
    blocos: valores.map(([chave, valorCents]) => ({
      chave,
      rotulo: ROTULO_BLOCO[chave],
      valorCents,
      percentualDaRenda: razaoPercentual(valorCents, renda),
      // A nota explica um sinal que engana; num bloco zerado não há sinal a
      // explicar, e a frase viraria ruído em todo ciclo sem puxada.
      nota: valorCents === 0 ? null : (NOTA_BLOCO[chave] ?? null),
    })),
    somaDosBlocosCents: somaDeclarada + naoExplicadoCents,
    naoExplicadoCents,
  };
}

/**
 * "Disponível para gastar" partido em compromisso e escolha. As duas linhas
 * somam exatamente o bloco — e são DUAS, nunca fundidas: parcelamento é
 * compromisso que o dono já sabe que vem, gasto eventual é o que ele ainda
 * decide. O número que responde "quanto posso gastar sem me enrolar" é o
 * segundo, e um total único apagaria justamente essa distinção.
 */
function subdividirDisponivel(
  entrada: EntradaDestinoDaRenda,
  renda: number,
): DisponivelParaGastar {
  const totalCents = entrada.verbaVariavelCents;
  const parcelamentosDoCicloCents = somarParceladosCents(entrada.lancamentos);
  const gastosEventuaisDoMesCents = totalCents - parcelamentosDoCicloCents;

  // Mesmo predicado do teto (`contaComoVerbaVariavel`), sem duplicar regra: o
  // realizado é o corte em `hoje` e o programado é o resto do ciclo. Derivar o
  // programado por diferença dos dois cortes garante que os dois números nunca
  // possam divergir do motor nem um do outro.
  const realizadoAteHojeCents = gastoVariavelSemParcelasCents(entrada.lancamentos, entrada.hoje);
  const ateOFimDoCicloCents = gastoVariavelSemParcelasCents(
    entrada.lancamentos,
    entrada.fimDoCiclo > entrada.hoje ? entrada.fimDoCiclo : entrada.hoje,
  );
  const programadoNoCicloCents = ateOFimDoCicloCents - realizadoAteHojeCents;

  const subdivisoes: [ChaveSubdivisaoDoDisponivel, number][] = [
    ['PARCELAMENTOS_DO_CICLO', parcelamentosDoCicloCents],
    ['GASTOS_EVENTUAIS_DO_MES', gastosEventuaisDoMesCents],
  ];

  return {
    totalCents,
    subdivisoes: subdivisoes.map(([chave, valorCents]) => ({
      chave,
      rotulo: ROTULO_SUBDIVISAO[chave],
      valorCents,
      percentualDaRenda: razaoPercentual(valorCents, renda),
      percentualDoDisponivel: razaoPercentual(valorCents, totalCents),
    })),
    parcelamentosDoCicloCents,
    gastosEventuaisDoMesCents,
    realizadoAteHojeCents,
    programadoNoCicloCents,
    aindaSemDestinoCents:
      gastosEventuaisDoMesCents - realizadoAteHojeCents - programadoNoCicloCents,
  };
}

function resumirCustosFixos(entrada: EntradaDestinoDaRenda): ResumoCustosFixos {
  const semCategoria = entrada.custosFixos.filter((c) => c.categoriaId == null);
  const cadastradosHojeCents = entrada.custosFixos.reduce(
    (total, c) => total + assertCentavos(c.valorCents, 'custoFixo.valorCents'),
    0,
  );
  const diferencaCents = cadastradosHojeCents - entrada.fixosCents;

  return {
    congeladoNoCicloCents: entrada.fixosCents,
    cadastradosHojeCents,
    diferencaCents,
    motivoDiferenca: diferencaCents === 0 ? null : MOTIVO_CUSTOS_FIXOS_DIVERGENTES,
    quantidadeCadastrada: entrada.custosFixos.length,
    semCategoria: {
      quantidade: semCategoria.length,
      totalCents: semCategoria.reduce((total, c) => total + c.valorCents, 0),
    },
  };
}

/** Acumulador mutável de uma categoria enquanto as três origens são varridas. */
interface AcumuladorCategoria {
  categoriaId: string | null;
  custoFixoCents: number;
  parcelamentoCents: number;
  gastoEventualRealizadoCents: number;
  gastoEventualProgramadoCents: number;
  custosFixos: number;
  parcelas: number;
  gastosEventuaisRealizados: number;
  gastosEventuaisProgramados: number;
}

/**
 * Agrega as TRÊS origens por categoria numa tabela só, cada linha carregando
 * de onde veio cada pedaço (§12.4.1). Sem categoria não some: vira a linha
 * `categoriaId: null`, com contagem (D-14).
 */
function agregarPorCategoria(entrada: EntradaDestinoDaRenda): LinhaCategoriaDestino[] {
  const acumuladores = new Map<string, AcumuladorCategoria>();

  for (const custo of entrada.custosFixos) {
    const acc = obterAcumulador(acumuladores, custo.categoriaId);
    acc.custoFixoCents += custo.valorCents;
    acc.custosFixos += 1;
  }

  for (const lancamento of entrada.lancamentos) {
    if (lancamento.parcelamentoId != null) {
      const acc = obterAcumulador(acumuladores, lancamento.categoriaId);
      acc.parcelamentoCents += lancamento.valorCents;
      acc.parcelas += 1;
      continue;
    }
    acumularGastoEventual(acumuladores, lancamento, entrada.hoje);
  }

  return [...acumuladores.values()].map(montarLinha).sort((a, b) => b.totalCents - a.totalCents);
}

/**
 * Gasto eventual = o que consome a verba e não é parcela. Mesmo predicado do
 * teto (`contaComoVerbaVariavel`): DESPESA soma, ESTORNO abate, RENDA,
 * TRANSFERENCIA e gasto de provisão ficam de fora. Competência futura entra
 * como PROGRAMADO, num campo separado — somá-la ao realizado é o que faz um
 * painel mentir (SPEC 5.1).
 */
function acumularGastoEventual(
  acumuladores: Map<string, AcumuladorCategoria>,
  lancamento: LancamentoDoCiclo,
  hoje: DataCivil,
): void {
  if (!contaComoVerbaVariavel(lancamento)) return;

  const delta =
    lancamento.tipo === 'DESPESA'
      ? lancamento.valorCents
      : lancamento.tipo === 'ESTORNO'
        ? -lancamento.valorCents
        : 0;
  if (delta === 0) return;

  const acc = obterAcumulador(acumuladores, lancamento.categoriaId);
  // Comparação lexicográfica de data civil (SPEC 5.1) — nunca `new Date`.
  // A contagem acompanha o valor que ela descreve: um contador único rotularia
  // o realizado com transações que na verdade estão no programado.
  if (lancamento.data > hoje) {
    acc.gastoEventualProgramadoCents += delta;
    acc.gastosEventuaisProgramados += 1;
    return;
  }
  acc.gastoEventualRealizadoCents += delta;
  acc.gastosEventuaisRealizados += 1;
}

function obterAcumulador(
  acumuladores: Map<string, AcumuladorCategoria>,
  categoriaId: string | null,
): AcumuladorCategoria {
  const chave = categoriaId ?? SEM_CATEGORIA_ID;
  const existente = acumuladores.get(chave);
  if (existente) return existente;

  const novo: AcumuladorCategoria = {
    categoriaId,
    custoFixoCents: 0,
    parcelamentoCents: 0,
    gastoEventualRealizadoCents: 0,
    gastoEventualProgramadoCents: 0,
    custosFixos: 0,
    parcelas: 0,
    gastosEventuaisRealizados: 0,
    gastosEventuaisProgramados: 0,
  };
  acumuladores.set(chave, novo);
  return novo;
}

/**
 * 🔴 O predicado de mistura é `custo fixo E gasto de verba`, não
 * `origens.length > 1`.
 *
 * Parcela e gasto eventual são as duas `Transacao` de grupo VARIAVEL que
 * consomem o mesmo teto (D-11): a soma delas É o gasto de verba da categoria,
 * não uma mistura. Com `length > 1`, "Eletrônicos" com a parcela do celular e
 * um cabo avulso já disparava o aviso — e o aviso afirmava que o total não era
 * gasto de verba nem custo fixo, o que era falso. Com 13 parcelamentos ativos
 * no cadastro do dono o alarme tocava em quase toda categoria, e o caso real
 * (§12.4.1) ficava indistinguível do ruído.
 */
function houveMisturaDeOrigem(acc: AcumuladorCategoria): boolean {
  const gastosDeVerba = acc.parcelas + acc.gastosEventuaisRealizados + acc.gastosEventuaisProgramados;
  return acc.custosFixos > 0 && gastosDeVerba > 0;
}

function montarLinha(acc: AcumuladorCategoria): LinhaCategoriaDestino {
  const gastoEventualCents = acc.gastoEventualRealizadoCents + acc.gastoEventualProgramadoCents;
  const gastosEventuais = acc.gastosEventuaisRealizados + acc.gastosEventuaisProgramados;
  const origens: OrigemDoDestino[] = [];
  if (acc.custosFixos > 0) origens.push('CUSTO_FIXO');
  if (acc.parcelas > 0) origens.push('PARCELAMENTO');
  if (gastosEventuais > 0) origens.push('GASTO_EVENTUAL');

  return {
    categoriaId: acc.categoriaId,
    totalCents: acc.custoFixoCents + acc.parcelamentoCents + gastoEventualCents,
    partes: {
      custoFixoCents: acc.custoFixoCents,
      parcelamentoCents: acc.parcelamentoCents,
      gastoEventualRealizadoCents: acc.gastoEventualRealizadoCents,
      gastoEventualProgramadoCents: acc.gastoEventualProgramadoCents,
    },
    quantidade: {
      custosFixos: acc.custosFixos,
      parcelas: acc.parcelas,
      gastosEventuais,
      gastosEventuaisRealizados: acc.gastosEventuaisRealizados,
      gastosEventuaisProgramados: acc.gastosEventuaisProgramados,
    },
    origens,
    misturaOrigens: houveMisturaDeOrigem(acc),
  };
}
