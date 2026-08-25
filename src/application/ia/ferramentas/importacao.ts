/**
 * Ferramentas do copiloto sobre a importação de fatura (I3 do
 * `TASKS-IMPORTACAO.md`, onda 3 — §15.1/§15.7).
 *
 * Duas ferramentas, nenhuma extrai e nenhuma grava — a extração já aconteceu
 * na rota de upload (`app/api/importacao/route.ts`, agente irmão) e a
 * conciliação pura já rodou em `application/importacao/conciliar.ts`, que
 * persistiu o rascunho. Este arquivo só LÊ o que já existe:
 *
 *  - `conciliar_importacao` — leitura. Devolve o resumo por faixa de um
 *    rascunho já persistido, para o copiloto narrar em texto o passo 4 do
 *    fluxo (§15.1): "Li 40 lançamentos, R$ 8.432,10 no total. 23 já estão
 *    registrados. 8 são custos fixos que reconheci. 7 são novos: [...].
 *    2 não consegui decidir: [...]".
 *  - `propor_importacao` — proposta. NUNCA grava: devolve o envelope padrão
 *    de proposta (D-8) com a lista INTEIRA de linhas, agrupada por faixa, e o
 *    total. Diferente de `propor_lancamento`/`propor_parcelamento`, esta
 *    proposta não é "um clique grava tudo" — a D-18 revista (§15.7) exige
 *    confirmação POR LINHA: o que já casa com o registro existente
 *    (`JA_REGISTRADO`/`CUSTO_FIXO_RECONHECIDO`) não pede nada, e cada linha
 *    `NOVO`/`PRECISA_DE_VOCE` é confirmada individualmente por
 *    `confirmarItemImportado` (`application/importacao/confirmar.ts`, já
 *    existe). Por isso `confirmarProposta` (`actions/ia.ts`) recusa
 *    explicitamente executar este tipo — ver o comentário lá.
 *
 * 🔴 A TRAVA DA §9.3 SE APLICA: nenhuma linha aqui carrega `categoriaId` nem
 * qualquer campo decisório inferido pelo modelo. O modelo não participa desta
 * leitura — os dois argumentos que ele fornece são só o `importacaoId`.
 *
 * A derivação veredito → faixa NÃO é reimplementada aqui: vem de
 * `faixaAproximadaDoItemPersistido` (`application/importacao/conciliar.ts`),
 * que passou a ser exportada exatamente para isto. Duas cópias do mesmo
 * switch é como uma delas envelhece sozinha — foi o que aconteceu com o
 * vocabulário de veredito nesta mesma fase, e a faixa só agrupa PARA
 * EXIBIÇÃO: quem decide gravação é o `veredito` bruto em
 * `confirmarItemImportado`, nunca a faixa.
 */
import type { Deps } from '@/application/deps';
import { formatBRL } from '@/shared/dinheiro';
import type { ItemImportado } from '@/domain/model/entidades';
import type { Faixa } from '@/domain/finance/importacao-tipos';
import { descreverProposta, propostaImportacaoSchema, type ItemPropostaImportacao, type PropostaImportacao } from '../propostas';
import { dinheiro, erroFerramenta, type SaidaFerramenta } from './saida';
import { faixaAproximadaDoItemPersistido } from '@/application/importacao/conciliar';

interface ArgumentosImportacao {
  importacaoId: string;
}

// ── Réplica documentada de application/importacao/conciliar.ts (ver cabeçalho) ──


interface ResumoDeFaixa {
  quantidade: number;
  totalCents: number;
  totalFormatado: string;
}

interface ResumoPorFaixa {
  jaRegistrado: ResumoDeFaixa;
  custoFixoReconhecido: ResumoDeFaixa;
  novo: ResumoDeFaixa;
  precisaDeVoce: ResumoDeFaixa;
  ignorado: ResumoDeFaixa;
}

const CHAVE_POR_FAIXA: Record<Faixa, keyof ResumoPorFaixa> = {
  JA_REGISTRADO: 'jaRegistrado',
  CUSTO_FIXO_RECONHECIDO: 'custoFixoReconhecido',
  NOVO: 'novo',
  PRECISA_DE_VOCE: 'precisaDeVoce',
  IGNORADO: 'ignorado',
};

function resumirPorFaixa(linhas: readonly { faixa: Faixa; valorCents: number }[]): ResumoPorFaixa {
  const grupos: Record<keyof ResumoPorFaixa, { quantidade: number; totalCents: number }> = {
    jaRegistrado: { quantidade: 0, totalCents: 0 },
    custoFixoReconhecido: { quantidade: 0, totalCents: 0 },
    novo: { quantidade: 0, totalCents: 0 },
    precisaDeVoce: { quantidade: 0, totalCents: 0 },
    ignorado: { quantidade: 0, totalCents: 0 },
  };
  for (const linha of linhas) {
    const grupo = grupos[CHAVE_POR_FAIXA[linha.faixa]];
    grupo.quantidade += 1;
    grupo.totalCents += linha.valorCents;
  }
  return Object.fromEntries(
    Object.entries(grupos).map(([chave, grupo]) => [
      chave,
      { ...grupo, totalFormatado: formatBRL(grupo.totalCents) },
    ]),
  ) as unknown as ResumoPorFaixa;
}

/** Uma linha, no formato mínimo que o dono precisa para decidir (§15.4: data, descrição, valor). */
function paraExibicao(item: ItemImportado): SaidaFerramenta {
  return {
    itemId: item.id,
    ordem: item.ordem,
    data: item.data,
    descricao: item.descricaoOriginal,
    ...dinheiro('valor', item.valorCents),
    vereditoMotivo: item.vereditoMotivo,
  };
}

// ── conciliar_importacao (leitura) ──────────────────────────────────────────

const ORIGEM_LEITURA =
  'application/ia/ferramentas/importacao.ts: conciliarImportacaoFerramenta (leitura de ImportacaoRepository.obter)';

/**
 * Lê o rascunho já conciliado e devolve o resumo por faixa + as linhas que
 * precisam de decisão do dono (`NOVO` e `PRECISA_DE_VOCE`). As faixas
 * `JA_REGISTRADO`/`CUSTO_FIXO_RECONHECIDO`/`IGNORADO` saem só como contagem e
 * total — são as que "não pedem nada" (§15.7), e listá-las linha a linha
 * seria ruído no texto que o copiloto narra.
 *
 * NÃO extrai e NÃO concilia: se `importacaoId` não existir, o erro instrui o
 * modelo a checar o id devolvido pelo upload, nunca a inventar uma extração
 * aqui.
 */
export async function conciliarImportacaoFerramenta(
  deps: Deps,
  argumentos: ArgumentosImportacao,
): Promise<SaidaFerramenta> {
  const encontrada = await deps.importacoes.obter(argumentos.importacaoId);
  if (!encontrada) {
    return erroFerramenta(
      `Importação "${argumentos.importacaoId}" não encontrada. Confira o id devolvido pelo upload do documento — esta ferramenta só lê um rascunho que já existe, nunca extrai um novo.`,
    );
  }

  const { importacao, itens } = encontrada;

  if (importacao.status === 'CONFIRMADA') {
    return {
      importacaoId: importacao.id,
      competenciaRef: importacao.competenciaRef,
      status: importacao.status,
      jaConfirmada: true,
      mensagem: `Esta fatura já foi confirmada, com ${itens.length} lançamento(s) — não há nada pendente para conciliar de novo.`,
      comoFoiCalculado: ORIGEM_LEITURA,
    };
  }

  const linhas = itens.map((item) => ({ item, faixa: faixaAproximadaDoItemPersistido(item) }));
  const totalGeralCents = itens.reduce((soma, item) => soma + item.valorCents, 0);

  return {
    importacaoId: importacao.id,
    competenciaRef: importacao.competenciaRef,
    status: importacao.status,
    jaConfirmada: false,
    resumoPorFaixa: resumirPorFaixa(linhas.map(({ item, faixa }) => ({ faixa, valorCents: item.valorCents }))),
    ...dinheiro('totalGeral', totalGeralCents),
    linhasNovas: linhas.filter((l) => l.faixa === 'NOVO').map((l) => paraExibicao(l.item)),
    linhasQuePrecisamDeVoce: linhas
      .filter((l) => l.faixa === 'PRECISA_DE_VOCE')
      .map((l) => paraExibicao(l.item)),
    comoFoiCalculado: ORIGEM_LEITURA,
  };
}

// ── propor_importacao (proposta) ────────────────────────────────────────────

const ORIGEM_PROPOSTA =
  'application/ia/ferramentas/importacao.ts: proporImportacao (nada é gravado — confirmação é POR LINHA, via confirmarItemImportado)';

/**
 * Monta a proposta com TODAS as linhas do rascunho, agrupadas por faixa, para
 * o dono ler e decidir (§15.1 passo 5). Os itens vêm do rascunho já
 * persistido — o modelo não redigita valor, data nem descrição aqui, então
 * não há superfície nova para ele errar um número.
 *
 * 🔴 Nunca inclui `categoriaId` nem qualquer campo decisório inferido: a
 * trava da §9.3 é estrutural neste schema, não um `if` que alguém pode
 * esquecer — `ItemPropostaImportacao` não tem esse campo.
 */
export async function proporImportacao(
  deps: Deps,
  argumentos: ArgumentosImportacao,
): Promise<SaidaFerramenta> {
  const encontrada = await deps.importacoes.obter(argumentos.importacaoId);
  if (!encontrada) {
    return erroFerramenta(
      `Importação "${argumentos.importacaoId}" não encontrada. Chame conciliar_importacao primeiro para conferir o id.`,
    );
  }

  const { importacao, itens } = encontrada;

  if (importacao.status === 'CONFIRMADA') {
    return erroFerramenta('Esta importação já foi confirmada — não há proposta nova para fazer.');
  }
  if (itens.length === 0) {
    return erroFerramenta('Este rascunho de importação não tem nenhuma linha.');
  }

  const itensProposta: ItemPropostaImportacao[] = itens.map((item) => ({
    itemId: item.id,
    ordem: item.ordem,
    faixa: faixaAproximadaDoItemPersistido(item),
    descricao: item.descricaoOriginal,
    data: item.data,
    valorCents: item.valorCents,
    valorFormatado: formatBRL(item.valorCents),
    vereditoMotivo: item.vereditoMotivo,
  }));

  const totalGeralCents = itensProposta.reduce((soma, item) => soma + item.valorCents, 0);

  const proposta: PropostaImportacao = {
    tipo: 'IMPORTACAO',
    importacaoId: importacao.id,
    competenciaRef: importacao.competenciaRef,
    totalGeralCents,
    itens: itensProposta,
  };

  const validado = propostaImportacaoSchema.safeParse(proposta);
  if (!validado.success) {
    return erroFerramenta(
      `Não consegui montar a proposta de importação: ${validado.error.issues.map((i) => i.message).join('; ')}`,
    );
  }

  return {
    proposta: descreverProposta(validado.data),
    precisaConfirmacao: true,
    aviso:
      'NADA foi gravado. Esta lista mostra TODAS as linhas da fatura, agrupadas por faixa. As já ' +
      'registradas e os custos fixos reconhecidos não pedem nada. Cada linha nova ou que precisa ' +
      'de atenção tem seu próprio botão de confirmar/descartar na tela — o dono decide uma de cada ' +
      'vez. Nunca diga que a importação inteira foi confirmada de uma vez só.',
    comoFoiCalculado: ORIGEM_PROPOSTA,
    ...dinheiro('totalGeral', totalGeralCents),
  };
}
