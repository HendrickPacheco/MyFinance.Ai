/**
 * Testes de `simularMetaPrazo` — a função que faltava no dia 11/08/2026, quando
 * o dono pediu "juntar R$ 70.000,00 até janeiro" e o copiloto respondeu duas
 * vezes que não tinha ferramenta para isso.
 *
 * ─── 🔴 D-16: APORTE NÃO É A META ───
 *
 * A meta de poupança deixou de ser deduzida da verba. Ela é um OBJETIVO, e o
 * que se guarda num ciclo é o que SOBRA da verba livre depois do gasto, com
 * teto na própria meta: `aporte = max(0, min(meta, verbaLivre − gasto))`.
 * Por isso todo ciclo da simulação traz `verbaLivreCents` — sem ele o aporte
 * seria a meta repetida N vezes, uma promessa que o dinheiro não cobre.
 *
 * O que este arquivo existe para impedir, em ordem de gravidade:
 *
 *  1. O GASTO DO CICLO ATUAL SUMIR OU VAZAR. O gasto já realizado come a sobra
 *     do ciclo em curso — e só dele. Se sumir, a simulação promete um aporte
 *     que já foi gasto; se vazar para os ciclos seguintes, ela desconta o
 *     mesmo gasto N vezes.
 *  2. A META VOLTAR A SER DESCONTADA DA VERBA (D-16). Com folga entre verba
 *     livre e meta, um gasto dentro dessa folga NÃO pode reduzir o aporte.
 *  3. O aporte sair menor EM SILÊNCIO (D-14): `reduzidoPorGastoExcedente` +
 *     `reducaoPorExcedenteCents` + `poupancaAlvoOriginalCents` são o que
 *     permite dizer POR QUE aquele ciclo aporta menos, e a partir de quanto.
 *  4. O total divergir das partes (D-15): `totalAcumulavelCents` tem que ser
 *     exatamente a soma dos aportes devolvidos, nunca um número recomposto por
 *     outro caminho — senão o dono vê a lista e a soma discordando.
 *  5. Prazo já vencido virar uma simulação vazia e otimista em vez de recusa.
 */
import { describe, expect, it } from 'vitest';
import {
  simularMetaPrazo,
  type CicloParaMeta,
  type ParametrosSimulacaoMetaPrazo,
} from './meta-prazo';

/** Meta do dono: R$ 18.000,00 por ciclo. */
const META = 1_800_000;
/**
 * Verba livre do ciclo (R$ 20.000,00) — já sem as parcelas comprometidas.
 * Desde a D-16 ela é MAIOR que a meta: a folga de R$ 2.000,00 é o que o dono
 * pode gastar sem tirar um centavo do aporte.
 */
const VERBA_LIVRE = 2_000_000;
const FOLGA = VERBA_LIVRE - META; // R$ 2.000,00

/** Ciclos mensais consecutivos com a mesma meta e a mesma verba livre. */
function ciclosMensais(
  inicios: readonly [string, string][],
  poupancaAlvoCents: number,
  verbaLivreCents: number,
): CicloParaMeta[] {
  return inicios.map(([inicio, fim]) => ({ inicio, fim, poupancaAlvoCents, verbaLivreCents }));
}

/** Seis ciclos civis de agosto/2026 a janeiro/2027. */
const CICLOS_ATE_JANEIRO: readonly [string, string][] = [
  ['2026-08-01', '2026-08-31'],
  ['2026-09-01', '2026-09-30'],
  ['2026-10-01', '2026-10-31'],
  ['2026-11-01', '2026-11-30'],
  ['2026-12-01', '2026-12-31'],
  ['2027-01-01', '2027-01-31'],
];

function params(patch: Partial<ParametrosSimulacaoMetaPrazo> = {}): ParametrosSimulacaoMetaPrazo {
  return {
    alvoCents: 7_000_000,
    dataLimite: '2027-01-31',
    ciclos: ciclosMensais(CICLOS_ATE_JANEIRO, META, VERBA_LIVRE),
    gastoRealizadoCicloAtualCents: null,
    ...patch,
  };
}

describe('simularMetaPrazo — matemática básica', () => {
  it('alvo alcançável devolve folga e nenhuma falta', () => {
    const r = simularMetaPrazo(params({ alvoCents: 5_000_000 }));

    expect(r.numCiclos).toBe(6);
    expect(r.totalAcumulavelCents).toBe(10_800_000);
    expect(r.alcanca).toBe(true);
    expect(r.folgaCents).toBe(5_800_000);
    // Os dois campos são exclusivos de propósito: preencher os dois deixaria o
    // modelo escolher qual narrar, e ele escolheria o mais bonito.
    expect(r.faltaCents).toBeNull();
  });

  it('alvo inalcançável devolve falta e nenhuma folga', () => {
    const r = simularMetaPrazo(params({ alvoCents: 15_000_000 }));

    expect(r.alcanca).toBe(false);
    expect(r.faltaCents).toBe(15_000_000 - 10_800_000);
    expect(r.folgaCents).toBeNull();
  });

  it('total exatamente igual ao alvo já conta como alcançado, com folga zero', () => {
    const r = simularMetaPrazo(params({ alvoCents: 10_800_000 }));

    expect(r.alcanca).toBe(true);
    expect(r.folgaCents).toBe(0);
    expect(r.faltaCents).toBeNull();
  });

  it('🔴 D-16: o aporte tem TETO na meta — verba livre sobrando não vira poupança', () => {
    // Sem o teto, um ciclo com R$ 20.000,00 de verba livre aportaria os
    // R$ 20.000,00 e a simulação alcançaria qualquer alvo. Poupar além da meta
    // não é o plano do dono: o que passa dela é dinheiro de gastar.
    const r = simularMetaPrazo(params());

    expect(r.ciclos.every((c) => c.aportePrevistoCents === META)).toBe(true);
    expect(r.totalAcumulavelCents).toBe(6 * META);
  });

  it('aportePorCicloNecessario arredonda para CIMA — para baixo não bate o alvo', () => {
    // 7.000.000 / 6 = 1.166.666,67 centavos. Arredondar para baixo daria
    // 6 × 1.166.666 = 6.999.996: quatro centavos a menos que o alvo.
    const r = simularMetaPrazo(params());

    expect(r.aportePorCicloNecessarioCents).toBe(1_166_667);
    expect(r.aportePorCicloNecessarioCents * r.numCiclos).toBeGreaterThanOrEqual(r.alvoCents);
  });

  it('sobraPorCiclo é o que ainda dá para mandar para outro destino', () => {
    const r = simularMetaPrazo(params());

    expect(r.aporteDisponivelPadraoCents).toBe(META);
    expect(r.sobraPorCicloCents).toBe(META - 1_166_667);
  });

  it('sobraPorCiclo negativa quando o alvo exige poupar mais que o normal', () => {
    const r = simularMetaPrazo(params({ alvoCents: 15_000_000 }));

    // ceil(15.000.000 / 6) = 2.500.000 contra 1.800.000 disponíveis.
    expect(r.sobraPorCicloCents).toBe(META - 2_500_000);
    expect(r.sobraPorCicloCents).toBeLessThan(0);
  });

  it('ciclos que começam depois da data-limite não entram na conta', () => {
    const r = simularMetaPrazo(
      params({
        dataLimite: '2026-10-15',
        // Comparação lexicográfica de string (CLAUDE.md regra 2): entram os
        // ciclos de agosto, setembro e outubro.
        ciclos: ciclosMensais(CICLOS_ATE_JANEIRO, META, VERBA_LIVRE),
      }),
    );

    expect(r.numCiclos).toBe(3);
    expect(r.ciclos.map((c) => c.inicio)).toEqual(['2026-08-01', '2026-09-01', '2026-10-01']);
    expect(r.totalAcumulavelCents).toBe(5_400_000);
  });

  it('o ciclo que COMEÇA na própria data-limite entra (limite inclusivo)', () => {
    const r = simularMetaPrazo(params({ dataLimite: '2026-09-01' }));

    expect(r.numCiclos).toBe(2);
  });

  it('devolve alvo e dataLimite como recebidos, para a resposta poder repeti-los', () => {
    const r = simularMetaPrazo(params());

    expect(r.alvoCents).toBe(7_000_000);
    expect(r.dataLimite).toBe('2027-01-31');
  });
});

/**
 * O coração da função. A meta do ciclo em curso NÃO é dinheiro garantido: ela
 * só se realiza no que sobrar da verba livre depois do gasto. Desde a D-16
 * existe uma FOLGA entre a verba livre e a meta, e o gasto só morde o aporte
 * depois de comer essa folga inteira.
 */
describe('simularMetaPrazo — o gasto do ciclo atual come a sobra', () => {
  it('🔴 D-16: gasto DENTRO da folga não reduz aporte nenhum', () => {
    // A prova de que a meta não é mais descontada da verba. Antes, qualquer
    // gasto acima da verba-já-sem-poupança virava desconto imediato no aporte;
    // agora os primeiros R$ 2.000,00 saem da folga e a meta segue inteira.
    const r = simularMetaPrazo(params({ gastoRealizadoCicloAtualCents: FOLGA }));

    expect(r.ciclos[0]?.aportePrevistoCents).toBe(META);
    expect(r.ciclos.every((c) => c.reduzidoPorGastoExcedente === false)).toBe(true);
    expect(r.totalAcumulavelCents).toBe(10_800_000);
  });

  it('passada a folga, reduz o aporte do PRIMEIRO ciclo e diz de quanto e a partir de quê', () => {
    const r = simularMetaPrazo(params({ gastoRealizadoCicloAtualCents: FOLGA + 50_000 }));

    const atual = r.ciclos[0];
    expect(atual?.aportePrevistoCents).toBe(META - 50_000);
    expect(atual?.reduzidoPorGastoExcedente).toBe(true);
    // D-15: as partes viajam com o derivado — "seriam R$ 18.000,00, viraram
    // R$ 17.500,00 porque faltaram R$ 500,00".
    expect(atual?.poupancaAlvoOriginalCents).toBe(META);
    expect(atual?.reducaoPorExcedenteCents).toBe(50_000);
  });

  it('nenhum ciclo futuro é tocado pelo gasto — ele é do ciclo atual só', () => {
    const r = simularMetaPrazo(params({ gastoRealizadoCicloAtualCents: FOLGA + 50_000 }));

    for (const ciclo of r.ciclos.slice(1)) {
      expect(ciclo.aportePrevistoCents).toBe(META);
      expect(ciclo.reduzidoPorGastoExcedente).toBe(false);
      expect(ciclo.reducaoPorExcedenteCents).toBe(0);
    }
    // Descontado UMA vez no total, não uma vez por ciclo.
    expect(r.totalAcumulavelCents).toBe(10_800_000 - 50_000);
  });

  it('caso normal: sem gasto nenhum, nenhum ciclo é marcado como reduzido', () => {
    const r = simularMetaPrazo(params({ gastoRealizadoCicloAtualCents: 0 }));

    expect(r.ciclos.every((c) => c.reduzidoPorGastoExcedente === false)).toBe(true);
    expect(r.totalAcumulavelCents).toBe(10_800_000);
  });

  it('sem ciclo aberto (gasto null) também não marca nem reduz ninguém', () => {
    const r = simularMetaPrazo(params({ gastoRealizadoCicloAtualCents: null }));

    expect(r.ciclos.every((c) => c.reduzidoPorGastoExcedente === false)).toBe(true);
    expect(r.totalAcumulavelCents).toBe(10_800_000);
  });

  it('gasto acima da verba livre ZERA o aporte do ciclo, sem deixá-lo negativo', () => {
    // Estourar a verba não cria dívida de poupança: o dono simplesmente não
    // guarda nada naquele ciclo. Um aporte negativo comeria o aporte dos
    // outros ciclos no total, inventando um buraco que a verba já absorveu.
    const r = simularMetaPrazo(params({ gastoRealizadoCicloAtualCents: VERBA_LIVRE + 500_000 }));

    expect(r.ciclos[0]?.aportePrevistoCents).toBe(0);
    expect(r.ciclos[0]?.reduzidoPorGastoExcedente).toBe(true);
    expect(r.ciclos[0]?.reducaoPorExcedenteCents).toBe(META);
    expect(r.totalAcumulavelCents).toBe(10_800_000 - META);
  });

  it('🔴 ciclo FUTURO cuja verba livre não chega à meta também sai marcado', () => {
    // A redução não é privilégio do ciclo atual (D-16): um mês com muitas
    // parcelas comprometidas simplesmente não comporta a meta, e dizer isso é
    // obrigação — reduzir em silêncio faz o modelo inventar a causa (D-14).
    const r = simularMetaPrazo(
      params({
        dataLimite: '2026-09-30',
        ciclos: [
          { inicio: '2026-08-01', fim: '2026-08-31', poupancaAlvoCents: META, verbaLivreCents: VERBA_LIVRE },
          { inicio: '2026-09-01', fim: '2026-09-30', poupancaAlvoCents: META, verbaLivreCents: 1_000_000 },
        ],
      }),
    );

    expect(r.ciclos[1]?.aportePrevistoCents).toBe(1_000_000);
    expect(r.ciclos[1]?.reduzidoPorGastoExcedente).toBe(true);
    expect(r.ciclos[1]?.reducaoPorExcedenteCents).toBe(META - 1_000_000);
    expect(r.totalAcumulavelCents).toBe(META + 1_000_000);
  });

  it('aporteDisponivelPadrao ignora o gasto — é a referência de "quanto normalmente sobra"', () => {
    const r = simularMetaPrazo(params({ gastoRealizadoCicloAtualCents: FOLGA + 50_000 }));

    expect(r.aporteDisponivelPadraoCents).toBe(META);
    expect(r.ciclos[0]?.aportePrevistoCents).not.toBe(r.aporteDisponivelPadraoCents);
  });

  it('com um único ciclo, o padrão vem dele mesmo, sem o gasto aplicado', () => {
    const r = simularMetaPrazo(
      params({
        dataLimite: '2026-08-31',
        gastoRealizadoCicloAtualCents: FOLGA + 50_000,
      }),
    );

    expect(r.numCiclos).toBe(1);
    expect(r.aporteDisponivelPadraoCents).toBe(META);
    expect(r.ciclos[0]?.aportePrevistoCents).toBe(META - 50_000);
  });

  it('ciclos com meta e verba livre diferentes entre si somam cada um o seu', () => {
    const r = simularMetaPrazo(
      params({
        ciclos: [
          {
            inicio: '2026-08-01',
            fim: '2026-08-31',
            poupancaAlvoCents: 1_000_000,
            verbaLivreCents: 1_100_000,
          },
          {
            inicio: '2026-09-01',
            fim: '2026-09-30',
            poupancaAlvoCents: 1_500_000,
            verbaLivreCents: 1_600_000,
          },
          {
            inicio: '2026-10-01',
            fim: '2026-10-31',
            poupancaAlvoCents: 2_000_000,
            verbaLivreCents: 2_200_000,
          },
        ],
        dataLimite: '2026-10-31',
        // Folga do primeiro ciclo é R$ 1.000,00; o gasto passa dela em R$ 1.000,00.
        gastoRealizadoCicloAtualCents: 200_000,
      }),
    );

    expect(r.ciclos.map((c) => c.aportePrevistoCents)).toEqual([900_000, 1_500_000, 2_000_000]);
    expect(r.totalAcumulavelCents).toBe(4_400_000);
    // O "padrão" é o SEGUNDO ciclo quando ele existe: o atual pode estar
    // ajustado e não representa o normal.
    expect(r.aporteDisponivelPadraoCents).toBe(1_500_000);
  });

  it('padrão com verba livre abaixo da meta é a verba livre, não a meta', () => {
    // `aporteDisponivelPadrao` responde "quanto normalmente sobra por ciclo".
    // Devolver a meta cheia aqui prometeria um aporte que a verba não paga.
    const r = simularMetaPrazo(
      params({
        dataLimite: '2026-09-30',
        ciclos: [
          { inicio: '2026-08-01', fim: '2026-08-31', poupancaAlvoCents: META, verbaLivreCents: VERBA_LIVRE },
          { inicio: '2026-09-01', fim: '2026-09-30', poupancaAlvoCents: META, verbaLivreCents: 900_000 },
        ],
      }),
    );

    expect(r.aporteDisponivelPadraoCents).toBe(900_000);
  });

  it('verba livre negativa (modo recuperação) não vira aporte negativo', () => {
    const r = simularMetaPrazo(
      params({
        dataLimite: '2026-08-31',
        ciclos: [
          { inicio: '2026-08-01', fim: '2026-08-31', poupancaAlvoCents: META, verbaLivreCents: -50_000 },
        ],
      }),
    );

    expect(r.ciclos[0]?.aportePrevistoCents).toBe(0);
    expect(r.aporteDisponivelPadraoCents).toBe(0);
    expect(r.totalAcumulavelCents).toBe(0);
  });
});

/**
 * D-15: número derivado viaja com suas partes. Se a soma dos aportes exibidos
 * não recompuser o total, o dono vê a lista discordando do resumo — e é a lista
 * que ele confere.
 */
describe('simularMetaPrazo — coerência entre derivados e partes (D-15)', () => {
  it.each([
    ['sem gasto', null],
    ['com gasto no ciclo atual', 213_753],
  ] as const)('a soma dos aportes é exatamente totalAcumulavel (%s)', (_caso, gasto) => {
    const r = simularMetaPrazo(params({ gastoRealizadoCicloAtualCents: gasto }));

    const soma = r.ciclos.reduce((acc, c) => acc + c.aportePrevistoCents, 0);
    expect(soma).toBe(r.totalAcumulavelCents);
    expect(r.ciclos).toHaveLength(r.numCiclos);
  });

  it('aporte + redução recompõem a meta original em todo ciclo', () => {
    const r = simularMetaPrazo(params({ gastoRealizadoCicloAtualCents: 213_753 }));

    for (const ciclo of r.ciclos) {
      expect(ciclo.aportePrevistoCents + ciclo.reducaoPorExcedenteCents).toBe(
        ciclo.poupancaAlvoOriginalCents,
      );
      expect(ciclo.reduzidoPorGastoExcedente).toBe(ciclo.reducaoPorExcedenteCents > 0);
    }
  });

  it('folga e falta recompõem alvo e total, sem terceiro número solto', () => {
    const alcanca = simularMetaPrazo(params({ alvoCents: 5_000_000 }));
    expect((alcanca.folgaCents ?? 0) + alcanca.alvoCents).toBe(alcanca.totalAcumulavelCents);

    const naoAlcanca = simularMetaPrazo(params({ alvoCents: 15_000_000 }));
    expect(naoAlcanca.totalAcumulavelCents + (naoAlcanca.faltaCents ?? 0)).toBe(
      naoAlcanca.alvoCents,
    );
  });

  it('sobraPorCiclo é exatamente padrão − necessário', () => {
    const r = simularMetaPrazo(params());

    expect(r.sobraPorCicloCents).toBe(
      r.aporteDisponivelPadraoCents - r.aportePorCicloNecessarioCents,
    );
  });

  it('todo valor devolvido é inteiro em centavos (CLAUDE.md regra 1)', () => {
    const r = simularMetaPrazo(params({ gastoRealizadoCicloAtualCents: 213_753 }));

    const inteiros = [
      r.alvoCents,
      r.totalAcumulavelCents,
      r.aportePorCicloNecessarioCents,
      r.aporteDisponivelPadraoCents,
      r.sobraPorCicloCents,
      ...r.ciclos.map((c) => c.aportePrevistoCents),
      ...r.ciclos.map((c) => c.reducaoPorExcedenteCents),
      ...r.ciclos.map((c) => c.poupancaAlvoOriginalCents),
    ];
    for (const valor of inteiros) expect(Number.isInteger(valor)).toBe(true);
  });
});

describe('simularMetaPrazo — entradas recusadas', () => {
  it('🔴 dataLimite anterior ao ciclo atual é RangeError com motivo legível', () => {
    // Sem isto a simulação devolveria zero ciclos e um total de R$ 0,00 — uma
    // resposta aritmeticamente correta e completamente inútil.
    expect(() => simularMetaPrazo(params({ dataLimite: '2026-07-31' }))).toThrow(RangeError);
    expect(() => simularMetaPrazo(params({ dataLimite: '2026-07-31' }))).toThrow(
      /anterior ao início do ciclo atual/i,
    );
  });

  it('lista de ciclos vazia também é recusada, não devolve total zero', () => {
    expect(() => simularMetaPrazo(params({ ciclos: [] }))).toThrow(RangeError);
  });

  it('alvo zero ou negativo é recusado', () => {
    expect(() => simularMetaPrazo(params({ alvoCents: 0 }))).toThrow(RangeError);
    expect(() => simularMetaPrazo(params({ alvoCents: -1 }))).toThrow(RangeError);
  });

  it('alvo em reais (não inteiro de centavos) é recusado antes de virar conta', () => {
    expect(() => simularMetaPrazo(params({ alvoCents: 70_000.5 }))).toThrow(TypeError);
  });

  it('gasto realizado não inteiro é recusado', () => {
    expect(() => simularMetaPrazo(params({ gastoRealizadoCicloAtualCents: 10.5 }))).toThrow(
      TypeError,
    );
  });

  it('data-limite fora do formato civil é recusada', () => {
    expect(() => simularMetaPrazo(params({ dataLimite: '31/01/2027' }))).toThrow();
  });
});

/**
 * Números reais do dono (CLAUDE.md, "Estado atual"): renda R$ 30.000,00, meta
 * de poupança R$ 18.000,00, fixos R$ 4.884,00, provisão R$ 500,00 e parcelas
 * de R$ 4.393,88 — sobram R$ 20.222,12 de verba livre por ciclo (D-16: a meta
 * NÃO entra nessa subtração). É o caso que gerou a função.
 */
describe('simularMetaPrazo — caso real: juntar R$ 70.000,00 até janeiro', () => {
  const VERBA_LIVRE_DONO = 2_022_212; // R$ 20.222,12

  const DONO = params({
    alvoCents: 7_000_000,
    dataLimite: '2027-01-31',
    ciclos: ciclosMensais(CICLOS_ATE_JANEIRO, META, VERBA_LIVRE_DONO),
  });

  it('alcança com folga, poupando menos que o normal por ciclo', () => {
    const r = simularMetaPrazo(DONO);

    expect(r.numCiclos).toBe(6);
    expect(r.alcanca).toBe(true);
    // 6 × R$ 18.000,00 = R$ 108.000,00, contra um alvo de R$ 70.000,00.
    expect(r.totalAcumulavelCents).toBe(10_800_000); // R$ 108.000,00
    expect(r.folgaCents).toBe(3_800_000); // R$ 38.000,00
    expect(r.aportePorCicloNecessarioCents).toBe(1_166_667); // R$ 11.666,67
    // Sobra por ciclo: o que ainda dá para mandar para outro destino.
    expect(r.sobraPorCicloCents).toBe(633_333); // R$ 6.333,33
  });

  it('com R$ 4.222,12 já gastos no ciclo atual, o plano continua alcançando — mas dizendo o que mudou', () => {
    // A folga do ciclo é R$ 2.222,12; o gasto passa dela em R$ 2.000,00, e é
    // exatamente isso que sai do aporte — nem um centavo a mais (D-16).
    const r = simularMetaPrazo({ ...DONO, gastoRealizadoCicloAtualCents: 422_212 });

    expect(r.ciclos[0]?.reduzidoPorGastoExcedente).toBe(true);
    expect(r.ciclos[0]?.aportePrevistoCents).toBe(1_600_000); // R$ 16.000,00
    expect(r.ciclos[0]?.reducaoPorExcedenteCents).toBe(200_000); // R$ 2.000,00
    expect(r.totalAcumulavelCents).toBe(10_600_000); // R$ 106.000,00
    expect(r.alcanca).toBe(true);
  });
});
