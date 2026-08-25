/**
 * Propostas de escrita do copiloto (decisão D-8, 04/08/2026).
 *
 * ─── O CONTRATO, EM UMA LINHA ───
 *
 * O copiloto PROPÕE; o dono CONFIRMA; o caso de uso de sempre EXECUTA.
 * Nenhuma ferramenta de IA escreve no banco. Nunca.
 *
 * ─── POR QUE NÃO DEIXAR O MODELO GRAVAR DIRETO ───
 *
 * Porque a Fase D inteira foi construída sobre uma premissa: o modelo é um
 * tradutor, não a fonte dos números. Uma ferramenta `criar_transacao` que
 * grava direto inverte isso — o valor gravado passa a ser o valor que o modelo
 * digitou, sem ninguém conferir. E diferente de uma resposta errada, que o
 * dono lê e descarta, um lançamento errado fica: ele consome verba, entra no
 * teto de amanhã e contamina o fechamento do ciclo.
 *
 * A rede de detecção da Fase D (`valoresNaoRastreados`) não ajuda aqui: ela
 * confere o que o modelo DISSE, não o que ele gravaria.
 *
 * Então a escrita vira um objeto que atravessa a resposta, aparece na tela com
 * o valor formatado e o nome da categoria, e só sai do lugar com um clique. O
 * clique chama `criarTransacao`/`criarParcelamento`/`salvarMemoria` — os
 * mesmos casos de uso das telas, com `exigirEscrita`, guarda de ciclo fechado
 * e efeito de saldo. Zero caminho paralelo.
 *
 * ─── NOTA SOBRE PROVENIÊNCIA ───
 *
 * Os campos monetários das propostas terminam em `Formatado` e por isso entram
 * em `valoresDisponiveis` do loop, o que impede a proposta de ser marcada como
 * valor alucinado. É deliberado, e a segurança não vem daí: vem de o número
 * estar na tela, ao lado do botão, antes de existir no banco.
 */
import { z } from 'zod';
import { formatBRL } from '@/shared/dinheiro';
import { TIPOS_MEMORIA } from '@/domain/memoria/regras';

const DATA_CIVIL = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'data civil precisa estar em YYYY-MM-DD');

/**
 * Métodos aceitos numa proposta. Repetidos aqui como literais (em vez de
 * importados de `domain/model/enums`) porque este schema é a FRONTEIRA com o
 * modelo: se um método novo aparecer no domínio, ele só passa a ser
 * proponível quando alguém decidir conscientemente incluí-lo.
 */
export const METODOS_PROPONIVEIS = [
  'DEBITO',
  'CREDITO',
  'PIX',
  'DINHEIRO',
  'BOLETO',
] as const;

/**
 * Uma proposta de lançamento. Sempre DESPESA: renda, transferência e estorno
 * têm efeito colateral em saldo de conta e em fechamento que não cabe num
 * fluxo de "propor e confirmar num clique" — o dono faz pela tela.
 */
/**
 * Campo só de EXIBIÇÃO, preenchido por `descreverProposta` e nunca enviado
 * pelo modelo. Existe porque a proposta viaja dentro da saída da ferramenta, e
 * a convenção da D1 vale ali também: todo `*Cents` visível ao modelo tem um
 * irmão `*Formatado`, senão ele recompõe o valor a partir dos centavos.
 *
 * `.optional()` é seguro aqui — este schema não é um schema de argumento de
 * ferramenta (esses proíbem `.optional()`, ver catalogo.ts). Na volta, o parse
 * da action simplesmente o ignora: quem grava lê apenas os centavos.
 */
const formatadoExibicao = z.string().optional();

export const propostaLancamentoSchema = z.object({
  tipo: z.literal('LANCAMENTO'),
  valorCents: z
    .number()
    .int('valor precisa ser inteiro em centavos')
    .positive('valor precisa ser positivo'),
  valorFormatado: formatadoExibicao,
  descricao: z.string().trim().min(1).max(120),
  data: DATA_CIVIL.nullable(),
  categoriaId: z.string().nullable(),
  contaId: z.string().nullable(),
  metodo: z.enum(METODOS_PROPONIVEIS).nullable(),
});

export const propostaParcelamentoSchema = z.object({
  tipo: z.literal('PARCELAMENTO'),
  descricao: z.string().trim().min(1).max(120),
  valorTotalCents: z.number().int().positive(),
  valorTotalFormatado: formatadoExibicao,
  numParcelas: z.number().int().min(2).max(60),
  dataCompra: DATA_CIVIL.nullable(),
  categoriaId: z.string().nullable(),
  metodo: z.enum(METODOS_PROPONIVEIS).nullable(),
});

export const propostaMemoriaSchema = z.object({
  tipo: z.literal('MEMORIA'),
  tipoMemoria: z.enum(TIPOS_MEMORIA),
  texto: z.string().trim().min(1).max(500),
});

/**
 * As mesmas cinco faixas de `Faixa` (`domain/finance/importacao-tipos.ts`,
 * §9.2/§15.7), repetidas aqui como literais pela mesma razão de
 * `METODOS_PROPONIVEIS` acima: este schema é a fronteira com a UI que recolhe
 * a proposta de volta para `confirmarProposta`, então uma faixa nova no
 * domínio só passa a ser proponível quando alguém decidir conscientemente
 * incluí-la aqui.
 */
export const FAIXAS_PROPONIVEIS = [
  'JA_REGISTRADO',
  'CUSTO_FIXO_RECONHECIDO',
  'NOVO',
  'PRECISA_DE_VOCE',
  'IGNORADO',
] as const;

/**
 * Uma linha da fatura dentro da proposta de importação. 🔴 Note o que NÃO
 * existe aqui: `categoriaId`, ou qualquer outro campo decisório que dependa
 * de inferência do modelo. A trava da §9.3 (`TASKS-IMPORTACAO.md`) é
 * estrutural neste schema — uma linha sem categoria entra sem categoria, e o
 * dono classifica depois, na confirmação por linha.
 */
export const itemPropostaImportacaoSchema = z.object({
  itemId: z.string().min(1),
  ordem: z.number().int(),
  faixa: z.enum(FAIXAS_PROPONIVEIS),
  descricao: z.string().trim().min(1).max(160),
  data: DATA_CIVIL.nullable(),
  valorCents: z.number().int().positive(),
  valorFormatado: formatadoExibicao,
  /** D-14: sempre preenchido — linha que não dá para decidir diz por quê. */
  vereditoMotivo: z.string().nullable(),
});

/**
 * Proposta com N linhas (§15.1/§15.7): uma proposta só, decisão por linha.
 * Diferente de LANCAMENTO/PARCELAMENTO/MEMORIA, confirmar esta proposta NÃO
 * grava nada de uma vez — cada linha `NOVO`/`PRECISA_DE_VOCE` é confirmada
 * individualmente por `confirmarItemImportado`
 * (`application/importacao/confirmar.ts`). Ver o comentário em
 * `confirmarProposta` (`actions/ia.ts`) sobre por que este tipo é recusado
 * ali.
 */
export const propostaImportacaoSchema = z.object({
  tipo: z.literal('IMPORTACAO'),
  importacaoId: z.string().min(1),
  competenciaRef: z.string().regex(/^\d{4}-\d{2}$/, 'competência precisa estar em YYYY-MM'),
  totalGeralCents: z.number().int(),
  totalGeralFormatado: formatadoExibicao,
  itens: z.array(itemPropostaImportacaoSchema).min(1).max(500),
});

export const propostaSchema = z.discriminatedUnion('tipo', [
  propostaLancamentoSchema,
  propostaParcelamentoSchema,
  propostaMemoriaSchema,
  propostaImportacaoSchema,
]);

export type PropostaLancamento = z.infer<typeof propostaLancamentoSchema>;
export type PropostaParcelamento = z.infer<typeof propostaParcelamentoSchema>;
export type PropostaMemoria = z.infer<typeof propostaMemoriaSchema>;
export type ItemPropostaImportacao = z.infer<typeof itemPropostaImportacaoSchema>;
export type PropostaImportacao = z.infer<typeof propostaImportacaoSchema>;
export type Proposta = z.infer<typeof propostaSchema>;

/**
 * A proposta como ela chega na tela: o dado que será executado, mais os
 * rótulos legíveis. Os rótulos existem porque `categoriaId: "cmsd..."` não é
 * confirmável por um humano — ninguém aprova o que não consegue ler.
 */
export interface PropostaExibivel {
  proposta: Proposta;
  /** Frase única, para o cabeçalho do cartão de confirmação. */
  resumo: string;
  /** Pares rótulo/valor mostrados antes do botão. */
  detalhes: { rotulo: string; valor: string }[];
}

/**
 * Função PURA (sem I/O): monta o texto que o dono lê antes de confirmar.
 * Recebe os nomes já resolvidos — quem consulta o banco é a ferramenta.
 *
 * Toda formatação monetária sai de `formatBRL`, nunca de concatenação local
 * (CLAUDE.md regra 1).
 */
export function descreverProposta(
  proposta: Proposta,
  nomes: { categoria?: string | null; conta?: string | null } = {},
): PropostaExibivel {
  switch (proposta.tipo) {
    case 'LANCAMENTO': {
      const detalhes = [
        { rotulo: 'Valor', valor: formatBRL(proposta.valorCents) },
        { rotulo: 'Descrição', valor: proposta.descricao },
        { rotulo: 'Data', valor: proposta.data ?? 'hoje' },
        { rotulo: 'Categoria', valor: nomes.categoria ?? 'sem categoria' },
      ];
      if (proposta.metodo) detalhes.push({ rotulo: 'Método', valor: proposta.metodo });
      if (nomes.conta) detalhes.push({ rotulo: 'Conta', valor: nomes.conta });

      return {
        // O irmão `*Formatado` entra aqui, e não no schema de argumento: é o
        // que impede o modelo de recompor "R$ 47,00" a partir de 4700.
        proposta: { ...proposta, valorFormatado: formatBRL(proposta.valorCents) },
        resumo: `Lançar ${formatBRL(proposta.valorCents)} — ${proposta.descricao}`,
        detalhes,
      };
    }

    case 'PARCELAMENTO': {
      return {
        proposta: { ...proposta, valorTotalFormatado: formatBRL(proposta.valorTotalCents) },
        resumo: `Criar parcelamento de ${formatBRL(proposta.valorTotalCents)} em ${proposta.numParcelas}x — ${proposta.descricao}`,
        detalhes: [
          { rotulo: 'Valor total', valor: formatBRL(proposta.valorTotalCents) },
          { rotulo: 'Parcelas', valor: `${proposta.numParcelas}x` },
          { rotulo: 'Descrição', valor: proposta.descricao },
          { rotulo: 'Data da compra', valor: proposta.dataCompra ?? 'hoje' },
          { rotulo: 'Categoria', valor: nomes.categoria ?? 'sem categoria' },
        ],
      };
    }

    case 'MEMORIA': {
      return {
        proposta,
        resumo: 'Guardar na memória do copiloto',
        detalhes: [
          { rotulo: 'Tipo', valor: proposta.tipoMemoria },
          { rotulo: 'Texto', valor: proposta.texto },
        ],
      };
    }

    case 'IMPORTACAO': {
      const ROTULO_FAIXA: Record<(typeof FAIXAS_PROPONIVEIS)[number], string> = {
        JA_REGISTRADO: 'Já registrado (nada a fazer)',
        CUSTO_FIXO_RECONHECIDO: 'Custo fixo reconhecido (nada a fazer)',
        NOVO: 'Novo — confirme um a um',
        PRECISA_DE_VOCE: 'Precisa de você',
        IGNORADO: 'Ignorado',
      };
      const contagemPorFaixa = new Map<(typeof FAIXAS_PROPONIVEIS)[number], number>();
      for (const item of proposta.itens) {
        contagemPorFaixa.set(item.faixa, (contagemPorFaixa.get(item.faixa) ?? 0) + 1);
      }

      return {
        proposta: { ...proposta, totalGeralFormatado: formatBRL(proposta.totalGeralCents) },
        resumo: `Fatura ${proposta.competenciaRef}: ${proposta.itens.length} linha(s), total ${formatBRL(proposta.totalGeralCents)}`,
        detalhes: [
          { rotulo: 'Competência', valor: proposta.competenciaRef },
          { rotulo: 'Total da fatura', valor: formatBRL(proposta.totalGeralCents) },
          ...FAIXAS_PROPONIVEIS.map((faixa) => ({
            rotulo: ROTULO_FAIXA[faixa],
            valor: String(contagemPorFaixa.get(faixa) ?? 0),
          })),
        ],
      };
    }
  }
}
