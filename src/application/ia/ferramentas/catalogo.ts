/**
 * Catálogo de ferramentas do copiloto (tarefa D1).
 *
 * Este arquivo declara O QUE existe: nome, schema de argumentos, descrição e
 * — o ponto crítico — de qual código já testado cada resposta vem. Ele NÃO
 * implementa nada; os wrappers são a tarefa D2.
 *
 * O princípio da fase, em uma linha: o modelo escolhe qual pergunta fazer ao
 * código; o código responde com o número; o modelo só narra.
 *
 * ─── CONVENÇÃO DE SAÍDA (obrigatória em todo wrapper da D2) ───
 *
 * 1. Toda grandeza monetária vira um PAR de campos irmãos:
 *
 *        { tetoHojeCents: 8300, tetoHojeFormatado: "R$ 83,00" }
 *
 *    `Formatado` sai de `formatBRL` (src/shared/dinheiro.ts). O prompt de
 *    sistema manda o modelo CITAR a string formatada, nunca recompor o valor
 *    a partir dos centavos. A verificação empírica da A0.5 confirmou que o
 *    modelo faz isso.
 *
 * 2. Toda saída carrega `comoFoiCalculado` — o nome da função de origem, para
 *    rastreabilidade e para a UI exibir proveniência.
 *
 * 3. Rótulo de bolso (SPEC 13: "não rotule um número sem dizer de qual bolso
 *    ele vem"). As ferramentas que expõem verba devolvem OS TRÊS campos —
 *    `verbaVariavelCents`, `parcelasComprometidasCents` e `verbaLivreCents` —
 *    sempre juntos. Devolver só um é o caminho mais curto para o copiloto
 *    dizer o número certo com o nome errado.
 *
 * ─── RESTRIÇÃO DE SCHEMA (achado da A0.3) ───
 *
 * Argumento de ferramenta NÃO usa `.optional()`. O modo estrito do provedor
 * exige todo campo em `required`; campo que pode faltar se declara
 * `.nullable()`, que continua obrigatório na chamada e aceita `null` como
 * "não informado".
 *
 * ─── READ-ONLY (decisão D-8) ───
 *
 * Não existe ferramenta de escrita. Nada de `criar_transacao`, `fechar_ciclo`
 * ou `atualizar_config`. Lançar gasto continua sendo ação do usuário na UI.
 */
import { z } from 'zod';
import type { DefinicaoFerramenta } from '@/domain/ports/ia';

const DATA_CIVIL = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'data civil precisa estar em YYYY-MM-DD');

export interface FerramentaCatalogo extends DefinicaoFerramenta {
  /** Mapeamento 1:1 com caso de uso ou função pura JÁ TESTADA. */
  origem: string;
  /** Valor de `comoFoiCalculado` que o wrapper devolve. */
  comoFoiCalculado: string;
  /**
   * `null` = liberada para a D2. Preenchido = a origem existe mas ainda não
   * pode ser usada como está; o texto diz exatamente o que falta.
   */
  bloqueio: string | null;
}

/**
 * Bloqueio comum a quatro ferramentas. `garantirCicloAtual`
 * (src/application/ciclos.ts:70) CRIA o ciclo quando ele não existe — é
 * escrita. `obterEstadoHoje`, `obterEstadoCiclo` e `obterEstadoPainel` passam
 * por ele, então usá-los como estão faria uma PERGUNTA gravar no banco,
 * violando a trava 5 (nada grava sem confirmação humana) e a decisão D-8.
 *
 * O que a D2 precisa fazer: uma leitura de ciclo sem efeito colateral
 * (`ciclos.obterAtual`, como já fez `obterProjecao` na C4) e variantes
 * read-only desses três read-models. Sem ciclo aberto, a ferramenta responde
 * que não há ciclo — não cria um.
 */
const BLOQUEIO_ESCRITA =
  'A origem passa por garantirCicloAtual, que cria o ciclo se faltar (escrita). ' +
  'A D2 precisa de uma variante read-only via ciclos.obterAtual, como em obterProjecao (C4).';

export const CATALOGO_FERRAMENTAS: readonly FerramentaCatalogo[] = [
  {
    nome: 'situacao_hoje',
    descricao:
      'Quanto o usuário pode gastar HOJE: teto do dia, quanto já gastou hoje, quanto ainda resta hoje e se está em modo recuperação. Use para perguntas sobre o dia corrente.',
    argumentos: z.object({}),
    origem: 'application/hoje.ts: obterEstadoHoje → domain/finance/teto.ts: calcularTeto',
    comoFoiCalculado: 'domain/finance/teto.ts: calcularTeto',
    bloqueio: BLOQUEIO_ESCRITA,
  },
  {
    nome: 'estado_ciclo',
    descricao:
      'Situação do ciclo inteiro: composição da verba, quanto já foi gasto, ritmo de gasto e projeção de fechamento. Use para perguntas sobre o mês/ciclo, não sobre hoje.',
    argumentos: z.object({}),
    origem:
      'application/ciclo-view.ts: obterEstadoCiclo → domain/finance/ritmo.ts: indicadoresRitmo',
    comoFoiCalculado: 'domain/finance/ritmo.ts: indicadoresRitmo',
    bloqueio: BLOQUEIO_ESCRITA,
  },
  {
    nome: 'gastos_por_categoria',
    descricao:
      'Quanto foi gasto por categoria no ciclo atual, da maior para a menor, com o percentual de cada uma. Use quando a pergunta for "onde meu dinheiro está indo".',
    argumentos: z.object({
      limite: z
        .number()
        .int()
        .min(1)
        .max(50)
        .nullable()
        .describe('Quantas categorias devolver. null = todas.'),
    }),
    origem:
      'application/dashboard.ts: obterEstadoPainel → domain/finance/agregacoes.ts: agregarGastoPorCategoria',
    comoFoiCalculado: 'domain/finance/agregacoes.ts: agregarGastoPorCategoria',
    bloqueio: BLOQUEIO_ESCRITA,
  },
  {
    nome: 'pagamentos_pendentes',
    descricao:
      'O que ainda falta pagar no ciclo atual: custos fixos não marcados como pagos e parcelas em aberto, com o total. Use para "o que falta pagar este mês".',
    argumentos: z.object({}),
    origem:
      'application/dashboard.ts: obterEstadoPainel → domain/finance/pagamentos.ts: resumoPagamentosCents',
    comoFoiCalculado: 'domain/finance/pagamentos.ts: resumoPagamentosCents',
    bloqueio: BLOQUEIO_ESCRITA,
  },
  {
    nome: 'analise_corte',
    descricao:
      'Onde dá para cortar gasto: ranking de categorias por custo ANUALIZADO nos últimos ciclos fechados, com tendência e se a categoria é essencial. Use para "onde eu corto" ou "como poupar mais".',
    argumentos: z.object({
      numCiclos: z
        .number()
        .int()
        .min(1)
        .max(12)
        .nullable()
        .describe('Quantos ciclos fechados considerar. null = 3 (padrão da tela Análise).'),
    }),
    origem: 'application/analise.ts: obterAnalise → domain/finance/analise.ts: analiseCategoria',
    comoFoiCalculado: 'domain/finance/analise.ts: analiseCategoria',
    bloqueio: null,
  },
  {
    nome: 'assinaturas_detectadas',
    descricao:
      'Cobranças recorrentes detectadas por repetição de descrição e valor entre ciclos — candidatas a assinatura esquecida. Detecção é código puro, sem IA.',
    argumentos: z.object({
      numCiclos: z
        .number()
        .int()
        .min(2)
        .max(12)
        .nullable()
        .describe('Quantos ciclos fechados varrer. null = 3.'),
    }),
    origem: 'application/analise.ts: obterAnalise → domain/finance/analise.ts: detectarAssinaturas',
    comoFoiCalculado: 'domain/finance/analise.ts: detectarAssinaturas',
    bloqueio: null,
  },
  {
    nome: 'patrimonio_resumo',
    descricao:
      'Patrimônio total no último snapshot, variação no mês, taxa média de acumulação e quantos meses de reserva isso representa. Use para perguntas sobre patrimônio ou reserva de emergência.',
    argumentos: z.object({}),
    origem:
      'application/patrimonio.ts: obterPatrimonio → domain/finance/patrimonio.ts: totalPatrimonioCents, mesesDeReserva',
    comoFoiCalculado: 'domain/finance/patrimonio.ts: totalPatrimonioCents, mesesDeReserva',
    bloqueio: null,
  },
  {
    nome: 'projetar_ciclos',
    descricao:
      'Projeta os próximos N ciclos: verba, parcelas já comprometidas, verba livre e se algum ciclo fica abaixo do piso diário. Use para perguntas sobre o futuro ("como fica em novembro").',
    argumentos: z.object({
      numCiclos: z
        .number()
        .int()
        .min(1)
        .max(60)
        .describe('Quantos ciclos projetar, incluindo o atual.'),
    }),
    origem: 'application/projecao.ts: obterProjecao → domain/finance/projecao.ts: projetarCiclos',
    comoFoiCalculado: 'domain/finance/projecao.ts: projetarCiclos',
    bloqueio: null,
  },
  {
    nome: 'simular_compra_parcelada',
    descricao:
      'Pré-mortem de compra: simula uma compra parcelada e mostra o impacto ciclo a ciclo na verba livre, incluindo em qual ciclo o orçamento passa a ficar abaixo do piso. Use para "posso comprar X em N vezes?".',
    argumentos: z.object({
      descricao: z.string().min(1).max(120).describe('O que está sendo comprado.'),
      valorTotalCents: z
        .number()
        .int()
        .positive()
        .describe('Valor TOTAL da compra em centavos inteiros (R$ 3.000,00 = 300000).'),
      numParcelas: z.number().int().min(1).max(60),
      dataCompra: DATA_CIVIL.nullable().describe('Data da compra. null = hoje.'),
      numCiclos: z
        .number()
        .int()
        .min(1)
        .max(60)
        .nullable()
        .describe('Horizonte da projeção. null = numParcelas + 2, para mostrar o alívio no fim.'),
    }),
    origem:
      'application/projecao.ts: obterProjecao (cenário) → domain/finance/projecao.ts: projetarComCenario',
    comoFoiCalculado: 'domain/finance/projecao.ts: projetarComCenario',
    bloqueio: null,
  },
];

/**
 * Ferramentas que expõem verba. Todas devolvem `verbaVariavelCents`,
 * `parcelasComprometidasCents` e `verbaLivreCents` JUNTOS, cada um com rótulo
 * de bolso. Um teste da D6 assere isso.
 */
export const FERRAMENTAS_COM_VERBA = [
  'estado_ciclo',
  'projetar_ciclos',
  'simular_compra_parcelada',
] as const;

/** Prontas para a D2 implementar. */
export const FERRAMENTAS_LIBERADAS: readonly FerramentaCatalogo[] = CATALOGO_FERRAMENTAS.filter(
  (f) => f.bloqueio === null,
);

/** Dependem de trabalho prévio — ver o texto de `bloqueio` de cada uma. */
export const FERRAMENTAS_BLOQUEADAS: readonly FerramentaCatalogo[] = CATALOGO_FERRAMENTAS.filter(
  (f) => f.bloqueio !== null,
);

/** As definições que vão para o provedor (sem os metadados internos). */
export function definicoesParaProvedor(
  ferramentas: readonly FerramentaCatalogo[] = CATALOGO_FERRAMENTAS,
): DefinicaoFerramenta[] {
  return ferramentas.map(({ nome, descricao, argumentos }) => ({ nome, descricao, argumentos }));
}
