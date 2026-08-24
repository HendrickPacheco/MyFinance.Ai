/**
 * Ferramenta `para_onde_vai_a_renda` (G8, TASKS-GRAFO §12).
 *
 * Casca fina, como toda ferramenta: chama o read-model, formata, devolve. Zero
 * aritmética monetária — a decomposição inteira é `domain/finance/
 * destino-da-renda.ts`, função pura com teste.
 *
 * É de LEITURA (regra 7b): não grava nada, e usa a variante somente-leitura do
 * read-model, que nunca abre ciclo (D-8).
 *
 * ─── O QUE ESTA SAÍDA EXISTE PARA IMPEDIR ───
 *
 * 1. DUPLA CONTAGEM (D-11). "Parcelamentos do ciclo" está DENTRO de
 *    "Disponível para gastar", nunca ao lado dos custos fixos. A saída diz
 *    isso em texto, porque um modelo que somar as duas coisas entrega ao dono
 *    um mês que não existe.
 * 2. RÓTULO AMBÍGUO (§12.2.1). "Variável" tem dois sentidos: o balde e o
 *    gasto eventual. `rotulosParaODono` fixa qual palavra usar para cada
 *    número — `verbaVariavel` e `verbaLivre` são nomes internos do motor e não
 *    podem ser ditos ao dono.
 * 3. NÚMERO SEM AS PARTES (D-15). Cada bloco viaja com o que o compõe, e cada
 *    linha por categoria diz quanto veio de custo fixo, quanto de parcela e
 *    quanto de gasto eventual (§12.4.1) — um total por categoria que não diz
 *    de onde veio cada pedaço é a mistura que a regra 5 proíbe, invisível.
 */
import type { Deps } from '@/application/deps';
import {
  obterDestinoDaRendaSomenteLeitura,
  type LinhaCategoriaDestinoView,
} from '@/application/destino-da-renda';
import { dinheiros, composicaoDaVerba, semCicloAberto, type SaidaFerramenta } from './saida';

const ORIGEM = 'domain/finance/destino-da-renda.ts: destinoDaRenda';

/** O vocabulário fixado com o dono em 24/08/2026 (§12.2.1). */
const ROTULOS_PARA_O_DONO = {
  verbaVariavel:
    'diga "Disponível para gastar": é o balde que sobra depois de poupança, fixos e provisão. NUNCA diga "verba variável" ao dono.',
  parcelasComprometidas:
    'diga "Parcelamentos do ciclo": as parcelas que caem neste mês. É compromisso já assumido, não escolha.',
  verbaLivre:
    'diga "Gastos eventuais do mês": o que resta depois das parcelas. É ESTE o número que responde "quanto posso gastar sem me enrolar".',
} as const;

const AVISO_DUPLA_CONTAGEM =
  'Os blocos de topo somam exatamente a renda do ciclo. "Parcelamentos do ciclo" NÃO é um ' +
  'bloco de topo: ele já está dentro de "Disponível para gastar" (cada parcela é uma ' +
  'despesa que consome o teto diário). Somar as parcelas aos blocos conta o mesmo ' +
  'dinheiro duas vezes e estoura a renda.';

const AVISO_ORIGEM_POR_CATEGORIA =
  'Cada linha de porCategoria traz as partes por ORIGEM. `misturaOrigens` marca UM caso e ' +
  'só ele: custo fixo e gasto de verba na MESMA categoria — um custo fixo pode estar ' +
  'classificado onde caem compras de verba (ex.: "Mercado"), e aí o total não é gasto de ' +
  'verba nem custo fixo. Quando for true, cite as partes, nunca só o total. Parcela junto ' +
  'com gasto eventual NÃO é mistura e não marca a linha: as duas são despesas que consomem ' +
  'o mesmo teto diário, então somá-las é exatamente o gasto de verba da categoria.';

/**
 * O vocabulário de `composicaoDaVerba` é INTERNO, e dizê-lo em voz alta
 * contradiria `rotulosParaODono` doze linhas acima na mesma saída.
 *
 * A decomposição continua indo junto (D-15) — foi ela que impediu o copiloto de
 * negar ao dono que a meta de poupança já estava descontada. O que o modelo
 * precisa saber é que aqueles nomes servem para AUDITAR o número, não para
 * narrá-lo.
 */
const AVISO_VOCABULARIO_INTERNO =
  'composicaoDaVerba usa os nomes do MOTOR (verbaVariavel, verbaLivre) porque ela existe ' +
  'para você conferir de onde o número veio. São vocabulário de auditoria, não de conversa: ' +
  'ao falar com o dono, traduza pelos rotulosParaODono desta mesma saída.';

export async function paraOndeVaiARenda(
  deps: Deps,
  argumentos: { limite: number | null },
): Promise<SaidaFerramenta> {
  const estado = await obterDestinoDaRendaSomenteLeitura(deps);
  if (!estado) return semCicloAberto(ORIGEM);

  const { destino } = estado;
  const categorias =
    argumentos.limite === null ? estado.porCategoria : estado.porCategoria.slice(0, argumentos.limite);

  return {
    periodo: estado.periodoLabel,
    hoje: estado.hoje,
    rotulosParaODono: ROTULOS_PARA_O_DONO,
    avisoDeDuplaContagem: AVISO_DUPLA_CONTAGEM,
    ...dinheiros({ rendaDoCiclo: destino.rendaDoCicloCents }),

    blocosDeTopo: destino.blocos.map((bloco) => ({
      rotulo: bloco.rotulo,
      chave: bloco.chave,
      percentualDaRenda: bloco.percentualDaRenda,
      // Por que o bloco tem o sinal que tem. Sem isto, "Puxada da reserva" com
      // valor negativo convida o modelo a narrar uma perda — quando o que
      // aconteceu foi entrar disponível vindo da reserva.
      nota: bloco.nota,
      ...dinheiros({ valor: bloco.valorCents }),
    })),
    fechaNaRenda: destino.naoExplicadoCents === 0,
    // D-14: diferença que existe explica POR QUE existe, em vez de sumir
    // dentro de outro bloco.
    motivoNaoExplicado: destino.motivoNaoExplicado,
    ...dinheiros({
      somaDosBlocosDeTopo: destino.somaDosBlocosCents,
      naoExplicado: destino.naoExplicadoCents,
    }),
    // A decomposição canônica da verba (D-15) viaja junto: é ela que impede o
    // copiloto de negar que a meta de poupança já foi descontada.
    avisoDeVocabularioInterno: AVISO_VOCABULARIO_INTERNO,
    ...composicaoDaVerba({
      rendaPrevistaCents: estado.ciclo.rendaPrevistaCents,
      poupancaAlvoCents: estado.ciclo.poupancaAlvoCents,
      fixosCents: estado.ciclo.fixosCents,
      provisaoMensalCents: estado.ciclo.provisaoMensalCents,
      rolloverRecebidoCents: estado.ciclo.rolloverRecebidoCents,
    }),

    disponivelParaGastar: {
      subdivisoes: destino.disponivelParaGastar.subdivisoes.map((sub) => ({
        rotulo: sub.rotulo,
        chave: sub.chave,
        percentualDaRenda: sub.percentualDaRenda,
        percentualDoDisponivel: sub.percentualDoDisponivel,
        ...dinheiros({ valor: sub.valorCents }),
      })),
      ...dinheiros({
        total: destino.disponivelParaGastar.totalCents,
        parcelamentosDoCiclo: destino.disponivelParaGastar.parcelamentosDoCicloCents,
        gastosEventuaisDoMes: destino.disponivelParaGastar.gastosEventuaisDoMesCents,
        realizadoAteHoje: destino.disponivelParaGastar.realizadoAteHojeCents,
        programadoNoCiclo: destino.disponivelParaGastar.programadoNoCicloCents,
        aindaSemDestino: destino.disponivelParaGastar.aindaSemDestinoCents,
      }),
    },

    custosFixos: {
      quantidadeCadastrada: destino.custosFixos.quantidadeCadastrada,
      // D-14: custo fixo sem categoria aparece com contagem, em vez de sumir.
      semCategoria: {
        quantidade: destino.custosFixos.semCategoria.quantidade,
        ...dinheiros({ total: destino.custosFixos.semCategoria.totalCents }),
      },
      motivoDiferenca: destino.custosFixos.motivoDiferenca,
      ...dinheiros({
        congeladoNoCiclo: destino.custosFixos.congeladoNoCicloCents,
        cadastradosHoje: destino.custosFixos.cadastradosHojeCents,
        diferenca: destino.custosFixos.diferencaCents,
      }),
    },

    avisoDeOrigemPorCategoria: AVISO_ORIGEM_POR_CATEGORIA,
    porCategoria: categorias.map(linhaDeCategoria),
    categoriasComMisturaDeOrigem: destino.categoriasComMisturaDeOrigem.length,

    comoFoiCalculado: ORIGEM,
  };
}

function linhaDeCategoria(linha: LinhaCategoriaDestinoView): SaidaFerramenta {
  return {
    nome: linha.nome,
    categoriaId: linha.categoriaId,
    origens: linha.origens,
    misturaOrigens: linha.misturaOrigens,
    quantidade: linha.quantidade,
    ...dinheiros({
      total: linha.totalCents,
      deCustoFixo: linha.partes.custoFixoCents,
      deParcelamento: linha.partes.parcelamentoCents,
      deGastoEventualRealizado: linha.partes.gastoEventualRealizadoCents,
      deGastoEventualProgramado: linha.partes.gastoEventualProgramadoCents,
    }),
  };
}
