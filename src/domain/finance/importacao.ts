/**
 * Conciliação de fatura (I2 do `TASKS-IMPORTACAO.md`). Função pura: recebe o
 * que já foi extraído da fatura e o que já está no banco, devolve um
 * veredito por linha. Não grava nada — quem grava é a camada de aplicação
 * (I3), e só depois que o dono confirma (7b do `CLAUDE.md`).
 *
 * 🔴 Risco crítico (R1, `TASKS-IMPORTACAO.md` §13): uma linha que casa com um
 * `CustoFixo` NUNCA pode produzir um veredito que a aplicação traduza em
 * `criarTransacao`. Custo fixo já está descontado em `Ciclo.fixosCents` —
 * lançar de novo conta o mesmo gasto duas vezes e derruba o teto diário do
 * dono. Por isso `CASA_CUSTO_FIXO` é um tipo de veredito à parte, cuja única
 * ação válida é `marcarCustoFixoPago` (rastreamento puro).
 */
import { diffDias, estaNoIntervalo, type DataCivil } from '@/shared/data';
import { normalizarDescricao } from './analise';
import type {
  Candidato,
  CustoFixoConciliavel,
  Faixa,
  ItemConciliado,
  ItemExtraido,
  LinhaRejeitada,
  ResultadoConciliacao,
  TransacaoConciliavel,
  Veredito,
} from './importacao-tipos';

const JANELA_DIAS_PADRAO = 3;

/** Comprimento mínimo de token para valer como sinal de afinidade (§7.3). */
const TAMANHO_MINIMO_TOKEN_AFIM = 4;

/**
 * Tokens que aparecem em toda linha de fatura e não identificam o
 * estabelecimento — descartados antes da comparação de afinidade. Lista
 * literal do plano (`TASKS-IMPORTACAO.md` §7.3): "pag", "pagto", "br", "sao",
 * "paulo", "compra". Códigos puramente numéricos (terminal, parcela impressa
 * de novo, CNPJ truncado) são descartados por regex, não por lista.
 */
const TOKENS_RUIDO = new Set(['pag', 'pagto', 'br', 'sao', 'paulo', 'compra']);

/**
 * Vereditos cuja tradução na aplicação GRAVA algo (`marcarCustoFixoPago`,
 * `criarTransacao`, `criarParcelamento`). São os únicos que a guarda de ciclo
 * fechado precisa promover para `PRECISA_DE_VOCE` — `CASA_PARCELA`/
 * `CASA_VARIAVEL` só marcam "já registrado" (nada novo é escrito) e `AMBIGUA`
 * já nasce na faixa 4, então a promoção seria um no-op.
 */
const TIPOS_QUE_GRAVAM: ReadonlySet<Veredito['tipo']> = new Set([
  'CASA_CUSTO_FIXO',
  'NOVA_AVULSA',
  'NOVA_PARCELA_ORFA',
]);

/**
 * Chave determinística da linha (§11, camada 3 de idempotência): reconhece o
 * mesmo lançamento entre duas importações da mesma fatura (ou de uma fatura
 * reemitida com layout diferente, mas o mesmo gasto). Função pura de
 * `ItemExtraido` — nunca envolve `ordem`, que muda se o banco reordena a
 * impressão.
 *
 * Usa `data` quando resolvida; cai para `dataOriginalTexto` quando `null`
 * (linha rejeitada ainda precisa de uma chave estável para não reaparecer
 * como "nova" a cada reimportação da mesma fatura ambígua).
 */
export function chaveDeduplicacao(item: ItemExtraido): string {
  const parte = item.parcela ? `${item.parcela.atual}/${item.parcela.total}` : 'sem-parcela';
  const dataParte = item.data ?? `texto:${item.dataOriginalTexto}`;
  const descNorm = normalizarDescricao(item.descricaoOriginal);
  return `${item.sinal}::${item.valorCents}::${dataParte}::${descNorm}::${parte}`;
}

/**
 * Tokeniza uma descrição para comparação de afinidade: normaliza (acentos,
 * caixa), separa em tokens por qualquer caractere não alfanumérico — não só
 * espaço, porque a fatura junta "PAG*IFOOD" sem espaço — e descarta ruído
 * conhecido e códigos puramente numéricos. Não é `normalizarDescricao`
 * (aquela função tem que continuar única no domínio: `grep -c "function
 * normalizar" src/domain/finance/` == 1); esta apenas a reusa.
 */
function tokensRelevantes(descricao: string | null): string[] {
  const normalizada = normalizarDescricao(descricao);
  return normalizada
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0 && !TOKENS_RUIDO.has(token) && !/^\d+$/.test(token));
}

/**
 * Afinidade por sobreposição de tokens (§7.3) — Levenshtein é péssimo aqui:
 * "PAG*IFOOD SAO PAULO BR" está a uma distância de edição enorme de "ifood" e
 * é o mesmo gasto. Regra: casa se algum token de >= 4 caracteres de um lado é
 * PREFIXO de um token do outro lado (cobre "ifood" vs "ifood delivery ltda").
 */
function possuiAfinidade(descricaoA: string | null, descricaoB: string | null): boolean {
  const tokensA = tokensRelevantes(descricaoA);
  const tokensB = tokensRelevantes(descricaoB);
  const algumEhPrefixoDoOutro = (origem: string[], destino: string[]): boolean =>
    origem.some(
      (token) =>
        token.length >= TAMANHO_MINIMO_TOKEN_AFIM &&
        destino.some((outro) => outro.startsWith(token)),
    );
  return algumEhPrefixoDoOutro(tokensA, tokensB) || algumEhPrefixoDoOutro(tokensB, tokensA);
}

/** Dia do mês (1..31) de uma `DataCivil` "YYYY-MM-DD", sem `new Date(`. */
function diaDoMes(data: DataCivil): number {
  return Number(data.slice(8, 10));
}

/** true se a competência da linha cai dentro de algum ciclo já fechado. */
function ehRetroativa(
  data: DataCivil,
  ciclosFechados: readonly { dataInicio: DataCivil; dataFim: DataCivil }[],
): boolean {
  return ciclosFechados.some((ciclo) => estaNoIntervalo(data, ciclo.dataInicio, ciclo.dataFim));
}

/**
 * A faixa é DERIVADA do veredito (mais o item e a retroatividade, que o
 * veredito por si não carrega) por função pura — a UI só agrupa, nunca
 * recalcula regra de negócio.
 *
 * Duas promoções não óbvias a partir do mapeamento 1-para-1 tipo -> faixa:
 * - `TARIFA` produz `NOVA_AVULSA`, mas cai em `PRECISA_DE_VOCE` (§7.4): é
 *   dinheiro que saiu e não pode ser ignorado, mas também não é lançamento
 *   trivial o bastante para ir em bloco.
 * - Ciclo fechado promove qualquer veredito que GRAVARIA algo para
 *   `PRECISA_DE_VOCE` (§7.4 "linha em ciclo fechado"), mesmo que o
 *   mapeamento base já fosse `NOVO` ou `CUSTO_FIXO_RECONHECIDO`.
 */
function faixaDoVeredito(item: ItemExtraido, veredito: Veredito, retroativa: boolean): Faixa {
  const base = faixaBaseDoTipo(veredito.tipo, item.sinal);
  if (retroativa && TIPOS_QUE_GRAVAM.has(veredito.tipo)) return 'PRECISA_DE_VOCE';
  return base;
}

function faixaBaseDoTipo(tipo: Veredito['tipo'], sinal: ItemExtraido['sinal']): Faixa {
  switch (tipo) {
    case 'CASA_PARCELA':
    case 'CASA_VARIAVEL':
      return 'JA_REGISTRADO';
    case 'CASA_CUSTO_FIXO':
      return 'CUSTO_FIXO_RECONHECIDO';
    case 'NOVA_AVULSA':
      return sinal === 'TARIFA' ? 'PRECISA_DE_VOCE' : 'NOVO';
    case 'NOVA_PARCELA_ORFA':
    case 'AMBIGUA':
      return 'PRECISA_DE_VOCE';
    case 'IGNORAR':
      return 'IGNORADO';
  }
}

/** Por que a linha foi descartada antes de qualquer tentativa de casamento. */
function motivoRejeicao(item: ItemExtraido): string | null {
  if (item.data === null) {
    return `data "${item.dataOriginalTexto}" não pôde ser resolvida (fatura ambígua) — informe a data manualmente`;
  }
  if (!Number.isInteger(item.valorCents) || item.valorCents <= 0) {
    return `valor lido (${item.valorCents}) não é um inteiro positivo em centavos — não é possível lançar`;
  }
  return null;
}

/** Transações com `parcelamentoId != null`, candidatas a `CASA_PARCELA`. */
function transacoesDeParcela(
  transacoes: readonly TransacaoConciliavel[],
): TransacaoConciliavel[] {
  return transacoes.filter((t) => t.parcelamentoId !== null);
}

/** Transações avulsas (sem parcelamento), candidatas a `CASA_VARIAVEL`. */
function transacoesAvulsas(transacoes: readonly TransacaoConciliavel[]): TransacaoConciliavel[] {
  return transacoes.filter((t) => t.parcelamentoId === null);
}

/**
 * Casa itens com `parcela` contra a `Transacao` que já gerou aquela parcela
 * específica. Único requisito é `parcelamentoId != null && parcelaNum ===
 * atual && valorCents` igual (§7.3): descrição é desempate, não requisito, e
 * data não entra na condição — o descritor de parcela muda de mês para mês,
 * mas a data da fatura para a mesma parcela é estável, então usamos
 * `diffDias` só para desempatar candidatos múltiplos, nunca para excluir.
 */
function conciliarItemComParcela(
  item: ItemExtraido & { data: DataCivil; parcela: { atual: number; total: number } },
  transacoesDisponiveis: readonly TransacaoConciliavel[],
  consumidas: Set<string>,
): Veredito {
  const candidatos = transacoesDeParcela(transacoesDisponiveis)
    .filter(
      (t) =>
        !consumidas.has(t.id) && t.parcelaNum === item.parcela.atual && t.valorCents === item.valorCents,
    )
    .sort((a, b) => {
      const diffA = Math.abs(diffDias(item.data, a.data));
      const diffB = Math.abs(diffDias(item.data, b.data));
      return diffA !== diffB ? diffA - diffB : a.id.localeCompare(b.id);
    });

  const escolhida = candidatos[0];
  if (escolhida !== undefined && escolhida.parcelamentoId !== null) {
    consumidas.add(escolhida.id);
    return {
      tipo: 'CASA_PARCELA',
      transacaoId: escolhida.id,
      parcelamentoId: escolhida.parcelamentoId,
      parcelaNum: item.parcela.atual,
      motivo: `parcela ${item.parcela.atual}/${item.parcela.total} já lançada como transação existente`,
    };
  }

  if (item.parcela.atual === 1) {
    return {
      tipo: 'NOVA_AVULSA',
      motivo: `primeira parcela (1/${item.parcela.total}) sem lançamento correspondente — vira parcelamento novo`,
    };
  }

  return {
    tipo: 'NOVA_PARCELA_ORFA',
    atual: item.parcela.atual,
    total: item.parcela.total,
    motivo: `parcela ${item.parcela.atual}/${item.parcela.total} sem parcelamento conhecido — registrada a partir da atual, sem histórico retroativo (D-17)`,
  };
}

/** Resultado de uma etapa de casamento contra transações avulsas. */
interface CasamentoAvulso {
  transacao: TransacaoConciliavel;
  motivo: string;
}

/** Nível 1 (exato): mesmo valor, mesma descrição normalizada, `diffDias === 0`. */
function casarNivel1(
  item: ItemExtraido & { data: DataCivil },
  disponiveis: readonly TransacaoConciliavel[],
): CasamentoAvulso | null {
  const descItem = normalizarDescricao(item.descricaoOriginal);
  const candidato = disponiveis.find(
    (t) =>
      t.valorCents === item.valorCents &&
      normalizarDescricao(t.descricao) === descItem &&
      diffDias(item.data, t.data) === 0,
  );
  if (candidato === undefined) return null;
  return { transacao: candidato, motivo: 'mesmo valor, mesma descrição e mesma data — casamento exato' };
}

/** Nível 2 (provável): mesmo valor, dentro da janela de dias, afinidade de descrição. */
function casarNivel2(
  item: ItemExtraido & { data: DataCivil },
  disponiveis: readonly TransacaoConciliavel[],
  janelaDias: number,
): CasamentoAvulso | null {
  const candidatos = disponiveis
    .filter(
      (t) =>
        t.valorCents === item.valorCents &&
        Math.abs(diffDias(item.data, t.data)) <= janelaDias &&
        possuiAfinidade(item.descricaoOriginal, t.descricao),
    )
    .sort((a, b) => {
      const diffA = Math.abs(diffDias(item.data, a.data));
      const diffB = Math.abs(diffDias(item.data, b.data));
      return diffA !== diffB ? diffA - diffB : a.id.localeCompare(b.id);
    });
  const escolhida = candidatos[0];
  if (escolhida === undefined) return null;
  return {
    transacao: escolhida,
    motivo: `mesmo valor, dentro de ${janelaDias} dia(s) e descrição compatível — casamento provável`,
  };
}

/** Custo fixo por valor exato + (nome afim OU dia de vencimento próximo). */
function casarCustoFixo(
  item: ItemExtraido & { data: DataCivil },
  custosFixosDisponiveis: readonly CustoFixoConciliavel[],
  janelaDias: number,
): CustoFixoConciliavel | null {
  const diaItem = diaDoMes(item.data);
  const candidatos = custosFixosDisponiveis
    .filter((cf) => cf.valorCents === item.valorCents)
    .filter(
      (cf) =>
        possuiAfinidade(item.descricaoOriginal, cf.nome) ||
        Math.abs(cf.diaVencimento - diaItem) <= janelaDias,
    )
    .sort((a, b) => Math.abs(a.diaVencimento - diaItem) - Math.abs(b.diaVencimento - diaItem));
  return candidatos[0] ?? null;
}

/** Candidatos de nível 3 (só valor, na janela) — nunca auto-aprovado. */
function candidatosAmbiguos(
  item: ItemExtraido & { data: DataCivil },
  disponiveis: readonly TransacaoConciliavel[],
  janelaDias: number,
): Candidato[] {
  return disponiveis
    .filter(
      (t) => t.valorCents === item.valorCents && Math.abs(diffDias(item.data, t.data)) <= janelaDias,
    )
    .map((t) => ({ transacaoId: t.id, data: t.data, valorCents: t.valorCents, descricao: t.descricao }));
}

/** Procura, só para compor o `motivo` — o estorno nunca consome candidato. */
function motivoEstorno(
  item: ItemExtraido & { data: DataCivil },
  transacoes: readonly TransacaoConciliavel[],
  janelaDias: number,
): string {
  const compraCorrespondente = transacoes.find(
    (t) => t.valorCents === item.valorCents && Math.abs(diffDias(item.data, t.data)) <= janelaDias,
  );
  if (compraCorrespondente === undefined) {
    return 'estorno sem compra correspondente encontrada no período — nenhuma ação necessária';
  }
  return `estorno da compra de ${compraCorrespondente.data} (mesmo valor) — trate na tela de transações, nada a lançar aqui`;
}

export function conciliarFatura(params: {
  itens: readonly ItemExtraido[];
  transacoes: readonly TransacaoConciliavel[];
  custosFixos: readonly CustoFixoConciliavel[];
  pagamentosDoCiclo: readonly { custoFixoId: string }[];
  ciclosFechados: readonly { dataInicio: DataCivil; dataFim: DataCivil }[];
  janelaDias?: number;
}): ResultadoConciliacao {
  const janelaDias = params.janelaDias ?? JANELA_DIAS_PADRAO;

  const rejeitadas: LinhaRejeitada[] = [];
  const validos: (ItemExtraido & { data: DataCivil })[] = [];
  for (const item of params.itens) {
    const motivo = motivoRejeicao(item);
    if (motivo !== null) {
      rejeitadas.push({ item, motivo });
      continue;
    }
    // `motivoRejeicao` já garantiu `item.data !== null` — o cast estreita o
    // tipo para o resto da função não carregar `| null` em toda parte.
    validos.push(item as ItemExtraido & { data: DataCivil });
  }

  const vereditoPorItem = new Map<ItemExtraido, Veredito>();

  const pagamentos = validos.filter((i) => i.sinal === 'PAGAMENTO_FATURA');
  for (const item of pagamentos) {
    vereditoPorItem.set(item, {
      tipo: 'IGNORAR',
      motivo: 'pagamento da fatura anterior — é transferência; lançar duplicaria a fatura inteira',
    });
  }

  const estornos = validos.filter((i) => i.sinal === 'ESTORNO');
  for (const item of estornos) {
    vereditoPorItem.set(item, {
      tipo: 'IGNORAR',
      motivo: motivoEstorno(item, params.transacoes, janelaDias),
    });
  }

  const tarifas = validos.filter((i) => i.sinal === 'TARIFA');
  for (const item of tarifas) {
    vereditoPorItem.set(item, {
      tipo: 'NOVA_AVULSA',
      motivo: 'tarifa (IOF, juros, anuidade ou multa) — consome verba, mas não é aprovada em bloco',
    });
  }

  const compras = validos.filter((i) => i.sinal === 'COMPRA');
  const comParcela = compras
    .filter((i): i is ItemExtraido & { data: DataCivil; parcela: { atual: number; total: number } } =>
      i.parcela !== null,
    )
    .sort((a, b) => a.ordem - b.ordem);
  const semParcela = compras.filter((i) => i.parcela === null).sort((a, b) => a.ordem - b.ordem);

  const transacoesConsumidas = new Set<string>();
  const custosFixosConsumidos = new Set<string>();

  for (const item of comParcela) {
    vereditoPorItem.set(item, conciliarItemComParcela(item, params.transacoes, transacoesConsumidas));
  }

  // Passe 1 (nível 1, exato) em TODOS os itens sem parcela antes do passe 2
  // (nível 2, provável): garante que um casamento exato nunca perde a
  // transação para um casamento provável processado antes dele só por
  // ordem — a atribuição 1-para-1 é gulosa em dois passes, não um algoritmo
  // húngaro (§7.3).
  const semParcelaPendentes = new Set(semParcela);
  for (const item of semParcela) {
    const disponiveis = transacoesAvulsas(params.transacoes).filter((t) => !transacoesConsumidas.has(t.id));
    const casamento = casarNivel1(item, disponiveis);
    if (casamento === null) continue;
    transacoesConsumidas.add(casamento.transacao.id);
    vereditoPorItem.set(item, { tipo: 'CASA_VARIAVEL', transacaoId: casamento.transacao.id, motivo: casamento.motivo });
    semParcelaPendentes.delete(item);
  }

  for (const item of semParcela) {
    if (!semParcelaPendentes.has(item)) continue;
    const disponiveis = transacoesAvulsas(params.transacoes).filter((t) => !transacoesConsumidas.has(t.id));
    const casamento = casarNivel2(item, disponiveis, janelaDias);
    if (casamento === null) continue;
    transacoesConsumidas.add(casamento.transacao.id);
    vereditoPorItem.set(item, { tipo: 'CASA_VARIAVEL', transacaoId: casamento.transacao.id, motivo: casamento.motivo });
    semParcelaPendentes.delete(item);
  }

  // Depois de transação avulsa: custo fixo (§7.3 precedência).
  for (const item of semParcela) {
    if (!semParcelaPendentes.has(item)) continue;
    const custosDisponiveis = params.custosFixos.filter((cf) => !custosFixosConsumidos.has(cf.id));
    const custoFixo = casarCustoFixo(item, custosDisponiveis, janelaDias);
    if (custoFixo === null) continue;
    custosFixosConsumidos.add(custoFixo.id);
    const jaMarcadoPago = params.pagamentosDoCiclo.some((p) => p.custoFixoId === custoFixo.id);
    vereditoPorItem.set(item, {
      tipo: 'CASA_CUSTO_FIXO',
      custoFixoId: custoFixo.id,
      jaMarcadoPago,
      motivo: `valor e vencimento compatíveis com o custo fixo "${custoFixo.nome}" — só marca pagamento, não lança`,
    });
    semParcelaPendentes.delete(item);
  }

  // Sobrou: nível 3 (só valor) vira AMBIGUA; sem candidato nenhum, é linha nova.
  for (const item of semParcela) {
    if (!semParcelaPendentes.has(item)) continue;
    const disponiveis = transacoesAvulsas(params.transacoes).filter((t) => !transacoesConsumidas.has(t.id));
    const candidatos = candidatosAmbiguos(item, disponiveis, janelaDias);
    if (candidatos.length > 0) {
      vereditoPorItem.set(item, {
        tipo: 'AMBIGUA',
        candidatos,
        motivo: `${candidatos.length} lançamento(s) com o mesmo valor na janela de ${janelaDias} dia(s), mas descrição não bate — confirmação manual`,
      });
    } else {
      vereditoPorItem.set(item, {
        tipo: 'NOVA_AVULSA',
        motivo: 'sem lançamento, custo fixo ou candidato correspondente — gasto novo',
      });
    }
  }

  const itensConciliados: ItemConciliado[] = validos.map((item) => {
    const veredito = vereditoPorItem.get(item);
    if (veredito === undefined) {
      // Inalcançável: todo item em `validos` passa por exatamente um dos
      // ramos de sinal acima, cada um dos quais grava um veredito.
      throw new Error(`item sem veredito atribuído (ordem ${item.ordem}) — bug na conciliação`);
    }
    const retroativa = ehRetroativa(item.data, params.ciclosFechados);
    return {
      item,
      veredito,
      faixa: faixaDoVeredito(item, veredito, retroativa),
      retroativa,
      chaveDedup: chaveDeduplicacao(item),
    };
  });

  const totais = { comprasCents: 0, estornosCents: 0, tarifasCents: 0, pagamentosFaturaCents: 0 };
  for (const item of validos) {
    switch (item.sinal) {
      case 'COMPRA':
        totais.comprasCents += item.valorCents;
        break;
      case 'ESTORNO':
        totais.estornosCents += item.valorCents;
        break;
      case 'TARIFA':
        totais.tarifasCents += item.valorCents;
        break;
      case 'PAGAMENTO_FATURA':
        totais.pagamentosFaturaCents += item.valorCents;
        break;
    }
  }

  return { itens: itensConciliados, rejeitadas, totais };
}
