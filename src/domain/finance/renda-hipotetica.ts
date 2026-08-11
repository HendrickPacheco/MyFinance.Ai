/**
 * Avaliação de um ciclo projetado sob renda hipotética (caso real 11/08/2026:
 * "se minha renda cair de 30k para 15k, dou conta da despesa até as parcelas
 * caírem?"). Função PURA: recebe um `CicloProjetado` já montado por
 * `projetarCiclos` com a renda hipotética plugada em `rendaPrevistaCents` —
 * nenhuma conta nova, só reinterpretação do que o motor já devolveu.
 *
 * A NUANCE que este arquivo existe para não deixar passar: com meta de
 * poupança de R$ 18.000 e renda hipotética de R$ 15.000, a meta sozinha já
 * excede a renda. `verbaVariavelCents = renda − poupança − fixos − provisão`
 * fica um número negativo grande — tecnicamente correto, praticamente inútil.
 * "Sua verba é negativa em R$ 8.605" não responde "dou conta da despesa?".
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

  const metaPoupancaCabeNaRenda = ciclo.verbaVariavelCents >= 0;

  return {
    metaPoupancaCabeNaRenda,
    motivoMetaNaoCabe: metaPoupancaCabeNaRenda
      ? null
      : 'A meta de poupança configurada, somada a fixos e provisão, é maior que a renda ' +
        'hipotética — por isso a verba variável do motor fica negativa. Isso não quer dizer ' +
        'que a renda não sustenta as despesas: veja sobraAposComprometidosCents (renda menos ' +
        'fixos e parcelas) e poupancaMaximaPossivelCents (o máximo que daria para poupar nessa ' +
        'renda, com a meta atual não cabendo mais).',
    comprometidoMensalCents,
    sobraAposComprometidosCents,
    poupancaMaximaPossivelCents,
  };
}
