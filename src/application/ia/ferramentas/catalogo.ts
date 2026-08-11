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
 * ─── ESCRITA POR PROPOSTA (decisão D-8, revista em 04/08/2026) ───
 *
 * A D-8 original dizia "não existe ferramenta de escrita". Isso foi revisto:
 * existem ferramentas `propor_*`, e continua não existindo `criar_transacao`.
 * A diferença não é de nome — nenhuma ferramenta grava. Uma `propor_*` valida,
 * resolve nomes e devolve um objeto que a UI mostra com um botão; a gravação
 * acontece na server action `confirmarProposta`, por clique do dono, chamando
 * os mesmos casos de uso das telas.
 *
 * Segue proibido, e sem tarefa: `fechar_ciclo` e `atualizar_config`. Fechar
 * ciclo credita provisão e move sobra; editar Config muda a verba do próximo
 * ciclo. Nenhum dos dois cabe num "confirmar" de uma linha — são telas com
 * aviso, e continuam sendo.
 */
import { z } from 'zod';
import type { DefinicaoFerramenta } from '@/domain/ports/ia';
import { METODOS_PROPONIVEIS } from '../propostas';
import { TIPOS_MEMORIA } from '@/domain/memoria/regras';

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
  /** Nota para quem implementar o wrapper. Não vai para o provedor. */
  observacao?: string;
}

/**
 * BLOQUEIO RESOLVIDO NA D1.5.
 *
 * Quatro ferramentas tinham origem em `obterEstadoHoje`, `obterEstadoCiclo` e
 * `obterEstadoPainel`, que passam por `garantirCicloAtual` — e esse CRIA o
 * ciclo quando falta. Usá-los como estavam faria uma PERGUNTA gravar no
 * banco, violando a trava 5 e a decisão D-8.
 *
 * A D1.5 acrescentou `lerCicloAtual` (src/application/ciclos.ts) e as
 * variantes `*SomenteLeitura` dos três read-models, que devolvem `null` em vez
 * de abrir ciclo. Os wrappers da D2 usam essas variantes — nunca as das telas.
 */
const ORIGEM_READ_ONLY = 'usa a variante *SomenteLeitura (D1.5), nunca a que chama garantirCicloAtual';

export const CATALOGO_FERRAMENTAS: readonly FerramentaCatalogo[] = [
  {
    nome: 'situacao_hoje',
    descricao:
      'Quanto o usuário pode gastar HOJE: teto do dia, quanto já gastou hoje, quanto ainda resta hoje e se está em modo recuperação. Use para perguntas sobre o dia corrente.',
    argumentos: z.object({}),
    origem: 'application/hoje.ts: obterEstadoHojeSomenteLeitura → domain/finance/teto.ts: calcularTeto',
    comoFoiCalculado: 'domain/finance/teto.ts: calcularTeto',
    bloqueio: null,
    observacao: ORIGEM_READ_ONLY,
  },
  {
    nome: 'estado_ciclo',
    descricao:
      'Situação do ciclo inteiro: composição da verba, quanto já foi gasto, ritmo de gasto e projeção de fechamento. Use para perguntas sobre o mês/ciclo, não sobre hoje.',
    argumentos: z.object({}),
    origem:
      'application/ciclo-view.ts: obterEstadoCicloSomenteLeitura → domain/finance/ritmo.ts: indicadoresRitmo',
    comoFoiCalculado: 'domain/finance/ritmo.ts: indicadoresRitmo',
    bloqueio: null,
    observacao: ORIGEM_READ_ONLY,
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
      'application/dashboard.ts: obterEstadoPainelSomenteLeitura → domain/finance/agregacoes.ts: agregarGastoPorCategoria',
    comoFoiCalculado: 'domain/finance/agregacoes.ts: agregarGastoPorCategoria',
    bloqueio: null,
    observacao: ORIGEM_READ_ONLY,
  },
  {
    nome: 'pagamentos_pendentes',
    descricao:
      'O que ainda falta pagar no ciclo atual: custos fixos não marcados como pagos e parcelas em aberto, com o total. Use para "o que falta pagar este mês".',
    argumentos: z.object({}),
    origem:
      'application/dashboard.ts: obterEstadoPainelSomenteLeitura → domain/finance/pagamentos.ts: resumoPagamentosCents',
    comoFoiCalculado: 'domain/finance/pagamentos.ts: resumoPagamentosCents',
    bloqueio: null,
    observacao: ORIGEM_READ_ONLY,
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
      'Patrimônio total no último snapshot, variação no mês, taxa média de acumulação e quantos meses de reserva isso representa. Use para perguntas sobre patrimônio ou reserva de emergência. Traz também o custo mensal comprometido (fixos + provisão) e mesesDeReservaComprometidos — a cobertura que já dá para afirmar mesmo sem nenhum ciclo fechado. Quando mesesDeReserva vier null, cite motivoDesconhecido literalmente; nunca invente a razão nem diga que faltam custos fixos cadastrados.',
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
  {
    nome: 'simular_meta_prazo',
    descricao:
      'Quanto dá para juntar até uma data-limite e se isso bate uma meta em R$: quantos ciclos cabem até lá, o aporte disponível por ciclo (a poupança-alvo), o total acumulável, se alcança o alvo (com folga ou falta) e o aporte por ciclo necessário para bater exatamente. Use para "quanto preciso guardar por mês para juntar X até Y" ou "dá para juntar X até Y". NÃO usa isso para saber quanto sobra HOJE (use situacao_hoje ou estado_ciclo).',
    argumentos: z.object({
      alvoCents: z
        .number()
        .int()
        .positive()
        .describe('Valor-alvo em centavos inteiros (R$ 70.000,00 = 7000000).'),
      dataLimite: DATA_CIVIL.describe('Data-limite para atingir o alvo, em YYYY-MM-DD.'),
    }),
    origem:
      'application/meta-prazo.ts: obterSimulacaoMetaPrazo → domain/finance/meta-prazo.ts: simularMetaPrazo',
    comoFoiCalculado: 'domain/finance/meta-prazo.ts: simularMetaPrazo',
    bloqueio: null,
  },
  {
    nome: 'simular_renda',
    descricao:
      'E se a renda mudasse: com uma renda hipotética, mostra ciclo a ciclo se os custos fixos e as parcelas cabem (comprometidoMensal e sobraAposComprometidos), se a meta de poupança configurada ainda cabe na renda (metaPoupancaCabeNaRenda) e o máximo que daria para poupar nessa renda. Use para "se minha renda cair/subir para X, dou conta das despesas?" ou "com renda de X, ainda consigo poupar?". NÃO grava nada e NÃO altera a Config — o ciclo em curso continua exatamente como está gravado (congelado), e a hipótese só vale a partir do próximo ciclo.',
    argumentos: z.object({
      rendaHipoteticaCents: z
        .number()
        .int()
        .positive()
        .describe('Renda mensal hipotética, em centavos inteiros (R$ 15.000,00 = 1500000).'),
      numCiclos: z
        .number()
        .int()
        .min(1)
        .max(60)
        .nullable()
        .describe('Horizonte da simulação, em ciclos. null = 6 (o atual e os próximos 5).'),
    }),
    origem:
      'application/renda-hipotetica.ts: obterSimulacaoRenda (via projecao.ts: obterProjecao → domain/finance/projecao.ts: projetarComCenario)',
    comoFoiCalculado:
      'application/renda-hipotetica.ts: obterSimulacaoRenda → domain/finance/renda-hipotetica.ts: avaliarRendaHipotetica',
    bloqueio: null,
  },

  // ─── Escrita por proposta (D-8) ──────────────────────────────────────────

  {
    nome: 'opcoes_de_lancamento',
    descricao:
      'Lista as categorias e contas disponíveis, com seus ids, e a data de hoje. Chame ANTES de propor um lançamento ou parcelamento — é de onde saem os ids válidos. Nunca invente um id.',
    argumentos: z.object({}),
    origem:
      'application/ia/ferramentas/escrita.ts: opcoesDeLancamento (leitura de Categoria e Conta, escopadas pelo dono)',
    comoFoiCalculado:
      'application/ia/ferramentas/escrita.ts: opcoesDeLancamento (leitura de Categoria e Conta)',
    bloqueio: null,
  },
  {
    nome: 'propor_lancamento',
    descricao:
      'Prepara um gasto para o usuário CONFIRMAR na tela. NÃO grava nada: devolve uma proposta que aparece com um botão de confirmar. Use quando o usuário disser que gastou algo ("gastei 47 no almoço", "lança 30 de uber"). Depois de chamar, diga o que preparou e peça a confirmação — nunca diga que já foi lançado.',
    argumentos: z.object({
      valorCents: z
        .number()
        .int()
        .positive()
        .describe('Valor em centavos inteiros (R$ 47,00 = 4700). Nunca use decimal.'),
      descricao: z.string().min(1).max(120).describe('O que foi comprado, nas palavras do usuário.'),
      data: DATA_CIVIL.nullable().describe('Data do gasto. null = hoje.'),
      categoriaId: z
        .string()
        .nullable()
        .describe('Id vindo de opcoes_de_lancamento. null = sem categoria.'),
      contaId: z.string().nullable().describe('Id vindo de opcoes_de_lancamento. null = não informado.'),
      metodo: z.enum(METODOS_PROPONIVEIS).nullable().describe('Meio de pagamento. null = não informado.'),
    }),
    origem: 'application/ia/propostas.ts → (na confirmação) application/transacoes.ts: criarTransacao',
    comoFoiCalculado: 'application/ia/propostas.ts: descreverProposta',
    bloqueio: null,
    observacao: 'NÃO grava. Quem grava é a action confirmarProposta, por clique do dono.',
  },
  {
    nome: 'propor_parcelamento',
    descricao:
      'Prepara um parcelamento para o usuário CONFIRMAR na tela. NÃO grava nada. Use quando o usuário decidir efetivamente parcelar algo. Para só SIMULAR o impacto antes de decidir, use simular_compra_parcelada — são coisas diferentes.',
    argumentos: z.object({
      descricao: z.string().min(1).max(120),
      valorTotalCents: z
        .number()
        .int()
        .positive()
        .describe('Valor TOTAL da compra em centavos (R$ 3.000,00 = 300000).'),
      numParcelas: z.number().int().min(2).max(60),
      dataCompra: DATA_CIVIL.nullable().describe('Data da compra. null = hoje.'),
      categoriaId: z.string().nullable(),
      metodo: z.enum(METODOS_PROPONIVEIS).nullable(),
    }),
    origem:
      'application/ia/propostas.ts → (na confirmação) application/transacoes.ts: criarParcelamento',
    comoFoiCalculado: 'application/ia/propostas.ts: descreverProposta',
    bloqueio: null,
    observacao: 'NÃO grava. Quem grava é a action confirmarProposta, por clique do dono.',
  },

  // ─── Memória (Fase E) ────────────────────────────────────────────────────

  {
    nome: 'buscar_memoria',
    descricao:
      'Busca no que o usuário já pediu para você lembrar: planos, metas, preferências, linhas vermelhas e contexto de vida. Use quando a resposta depender do que ele quer ou de como ele decide, não de quanto ele tem. Memória NUNCA contém valor em dinheiro — para número, use as outras ferramentas.',
    argumentos: z.object({
      consulta: z
        .string()
        .min(1)
        .max(300)
        .describe('O assunto sobre o qual você quer lembrar, em linguagem natural.'),
      limite: z.number().int().min(1).max(20).nullable().describe('Quantas memórias trazer. null = 5.'),
    }),
    origem: 'application/memoria.ts: buscarMemoria → pgvector (distância de cosseno)',
    comoFoiCalculado: 'application/memoria.ts: buscarMemoria (pgvector, distância de cosseno)',
    bloqueio: null,
  },
  {
    nome: 'propor_memoria',
    descricao:
      'Prepara uma memória para o usuário CONFIRMAR. NÃO grava nada. Use quando ele revelar um plano, uma preferência, uma linha vermelha ou um contexto de vida que valha lembrar nas próximas conversas. O texto NÃO pode conter valor em dinheiro — guarde a intenção ("quero formar uma reserva"), nunca o número.',
    argumentos: z.object({
      tipoMemoria: z
        .enum(TIPOS_MEMORIA)
        .describe(
          'PLANO = meta ou objetivo; PREFERENCIA = como ele gosta de decidir e o que recusa; CONTEXTO = vida, trabalho, família; CONVERSA = fato pontual que valha reter.',
        ),
      texto: z
        .string()
        .min(1)
        .max(500)
        .describe('A memória em uma frase, na terceira pessoa e SEM nenhum valor monetário.'),
    }),
    origem: 'domain/memoria/regras.ts: validarTextoMemoria → (na confirmação) application/memoria.ts: salvarMemoria',
    comoFoiCalculado: 'domain/memoria/regras.ts: validarTextoMemoria',
    bloqueio: null,
    observacao: 'NÃO grava. Quem grava é a action confirmarProposta, por clique do dono.',
  },
];

/**
 * Ferramentas que devolvem proposta em vez de dado. O loop as reconhece por
 * esta lista para recolher as propostas — nunca por prefixo de nome, que
 * quebraria silenciosamente numa renomeação.
 */
export const FERRAMENTAS_DE_PROPOSTA = [
  'propor_lancamento',
  'propor_parcelamento',
  'propor_memoria',
] as const;

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
