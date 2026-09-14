/**
 * Avaliação de um ciclo projetado sob renda hipotética (caso real 11/08/2026:
 * "se minha renda cair de 30k para 15k, dou conta da despesa até as parcelas
 * caírem?"). Função PURA: recebe um `CicloProjetado` já montado por
 * `projetarCiclos` com a renda hipotética plugada em `rendaPrevistaCents` —
 * nenhuma conta nova, só reinterpretação do que o motor já devolveu.
 *
 * A NUANCE que este arquivo existe para não deixar passar: com meta de
 * poupança de R$ 18.000 e renda hipotética de R$ 15.000, a meta sozinha já
 * excede a renda. Desde a D-16 a verba não fica negativa por causa disso — a
 * meta não é descontada —, mas a pergunta "a meta cabe?" continua existindo, e
 * responder com a verba (que ignora a meta) seria dizer que cabe sempre.
 *
 * A pergunta real é outra: os CUSTOS FIXOS e as PARCELAS — o que já está
 * comprometido, não a meta — cabem na renda hipotética? Por isso
 * `comprometidoMensalCents` deliberadamente NÃO inclui a poupança-alvo: ela
 * não é um gasto, é dinheiro que o usuário decidiu não gastar, e é
 * exatamente essa decisão que a renda mais baixa pode não sustentar mais.
 */
import type { CicloProjetado } from './projecao-tipos';

export interface AvaliacaoRendaHipotetica {
  /**
   * `false` quando a verba variável do motor (que JÁ desconta poupança-alvo,
   * fixos e provisão) fica negativa — a meta configurada não cabe mais na
   * renda hipotética. Nunca vira `false` só por parcela apertar o orçamento:
   * parcela mora em `comprometidoMensalCents`/`sobraAposComprometidosCents`.
   */
  metaPoupancaCabeNaRenda: boolean;
  /**
   * Preenchido só quando `metaPoupancaCabeNaRenda` é `false`. Texto pronto
   * para o copiloto citar em vez de expor a verba negativa crua (D-14): o
   * número sozinho convida a resposta errada ("sua verba é −R$ 8.605").
   */
  motivoMetaNaoCabe: string | null;
  /** Fixos + parcelas do ciclo — o que REALMENTE precisa ser pago, sem a
   * meta de poupança (que não é gasto). */
  comprometidoMensalCents: number;
  /** `rendaHipotetica − comprometidoMensalCents`. É este número, não a verba
   * variável, que responde "dou conta das despesas com essa renda?". */
  sobraAposComprometidosCents: number;
  /**
   * Quanto ainda daria para poupar naquela renda depois de fixos, provisão e
   * parcelas — com piso em zero. Não usa `poupancaAlvoCents` do ciclo: é o
   * espaço disponível INDEPENDENTE da meta configurada, a resposta para
   * "quanto eu poderia guardar, no máximo, se abaixasse a meta".
   */
  poupancaMaximaPossivelCents: number;
}

export function avaliarRendaHipotetica(ciclo: CicloProjetado): AvaliacaoRendaHipotetica {
  const comprometidoMensalCents = ciclo.fixosCents + ciclo.parcelasComprometidasCents;
  const sobraAposComprometidosCents = ciclo.rendaPrevistaCents - comprometidoMensalCents;

  const poupancaMaximaPossivelCents = Math.max(
    0,
    ciclo.rendaPrevistaCents -
      ciclo.fixosCents -
      ciclo.provisaoMensalCents -
      ciclo.parcelasComprometidasCents +
      ciclo.rolloverRecebidoCents,
  );

  // D-16: a verba não desconta mais a meta, então "a meta cabe?" não pode ser
  // lida do sinal da verba — cabe quando ainda sobra o alvo depois de fixos,
  // provisão e parcelas.
  const metaPoupancaCabeNaRenda = poupancaMaximaPossivelCents >= ciclo.poupancaAlvoCents;

  return {
    metaPoupancaCabeNaRenda,
    motivoMetaNaoCabe: metaPoupancaCabeNaRenda
      ? null
      : 'Nessa renda hipotética, o que sobra depois de custos fixos, provisão e parcelas é ' +
        'menor que a meta de poupança configurada — a meta não cabe. Isso não quer dizer que a ' +
        'renda não sustenta as despesas: veja sobraAposComprometidosCents (renda menos fixos e ' +
        'parcelas) e poupancaMaximaPossivelCents (o máximo que daria para poupar nessa renda).',
    comprometidoMensalCents,
    sobraAposComprometidosCents,
    poupancaMaximaPossivelCents,
  };
}
