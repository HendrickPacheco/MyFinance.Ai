/**
 * Testes de `simularMetaPrazo` — a função que faltava no dia 11/08/2026, quando
 * o dono pediu "juntar R$ 70.000,00 até janeiro" e o copiloto respondeu duas
 * vezes que não tinha ferramenta para isso.
 *
 * O que este arquivo existe para impedir, em ordem de gravidade:
 *
 *  1. O AJUSTE DO CICLO ATUAL SUMIR OU VAZAR. O gasto que estourou a verba do
 *     ciclo em curso sai da poupança DAQUELE ciclo — e só dele. Se o ajuste
 *     sumir, a simulação promete um aporte que já foi gasto; se vazar para os
 *     ciclos seguintes, ela desconta o mesmo excedente N vezes.
 *  2. O ajuste acontecer EM SILÊNCIO (D-14): `reduzidoPorGastoExcedente` é o
 *     que permite dizer POR QUE aquele ciclo aporta menos. Reduzir sem marcar
 *     faz o modelo inventar a causa.
 *  3. O total divergir das partes (D-15): `totalAcumulavelCents` tem que ser
 *     exatamente a soma dos aportes devolvidos, nunca um número recomposto por
 *     outro caminho — senão o dono vê a lista e a soma discordando.
 *  4. Prazo já vencido virar uma simulação vazia e otimista em vez de recusa.
 */
import { describe, expect, it } from 'vitest';
import {
  simularMetaPrazo,
  type CicloParaMeta,
  type ParametrosSimulacaoMetaPrazo,
} from './meta-prazo';

/** Ciclos mensais consecutivos com a mesma poupança-alvo. */
function ciclosMensais(
  inicios: readonly [string, string][],
  poupancaAlvoCents: number,
): CicloParaMeta[] {
  return inicios.map(([inicio, fim]) => ({ inicio, fim, poupancaAlvoCents }));
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
    ciclos: ciclosMensais(CICLOS_ATE_JANEIRO, 1_800_000),
    excedenteCicloAtualCents: null,
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

  it('aportePorCicloNecessario arredonda para CIMA — para baixo não bate o alvo', () => {
    // 7.000.000 / 6 = 1.166.666,67 centavos. Arredondar para baixo daria
    // 6 × 1.166.666 = 6.999.996: quatro centavos a menos que o alvo.
    const r = simularMetaPrazo(params());

    expect(r.aportePorCicloNecessarioCents).toBe(1_166_667);
    expect(r.aportePorCicloNecessarioCents * r.numCiclos).toBeGreaterThanOrEqual(r.alvoCents);
  });

  it('sobraPorCiclo é o que ainda dá para mandar para outro destino', () => {
    const r = simularMetaPrazo(params());

    expect(r.aporteDisponivelPadraoCents).toBe(1_800_000);
    expect(r.sobraPorCicloCents).toBe(1_800_000 - 1_166_667);
  });

  it('sobraPorCiclo negativa quando o alvo exige poupar mais que o normal', () => {
    const r = simularMetaPrazo(params({ alvoCents: 15_000_000 }));

    // ceil(15.000.000 / 6) = 2.500.000 contra 1.800.000 disponíveis.
    expect(r.sobraPorCicloCents).toBe(1_800_000 - 2_500_000);
    expect(r.sobraPorCicloCents).toBeLessThan(0);
  });

  it('ciclos que começam depois da data-limite não entram na conta', () => {
    const r = simularMetaPrazo(
      params({
        dataLimite: '2026-10-15',
        // Comparação lexicográfica de string (CLAUDE.md regra 2): entram os
        // ciclos de agosto, setembro e outubro.
        ciclos: ciclosMensais(CICLOS_ATE_JANEIRO, 1_800_000),
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
 * O coração da função. A poupança-alvo do ciclo em curso NÃO é dinheiro
 * garantido: se o gasto já realizado passou da verba variável, o excedente sai
 * da própria poupança daquele ciclo. É o mesmo dinheiro, não um segundo buraco.
 */
describe('simularMetaPrazo — ajuste do ciclo atual estourado', () => {
  it('reduz o aporte do PRIMEIRO ciclo pelo excedente e diz por quê', () => {
    const r = simularMetaPrazo(params({ excedenteCicloAtualCents: 500_00 }));

    const atual = r.ciclos[0];
    expect(atual?.aportePrevistoCents).toBe(1_800_000 - 50_000);
    expect(atual?.reduzidoPorGastoExcedente).toBe(true);
  });

  it('nenhum ciclo futuro é tocado pelo excedente — ele é do ciclo atual só', () => {
    const r = simularMetaPrazo(params({ excedenteCicloAtualCents: 50_000 }));

    for (const ciclo of r.ciclos.slice(1)) {
      expect(ciclo.aportePrevistoCents).toBe(1_800_000);
      expect(ciclo.reduzidoPorGastoExcedente).toBe(false);
    }
    // Descontado UMA vez no total, não uma vez por ciclo.
    expect(r.totalAcumulavelCents).toBe(10_800_000 - 50_000);
  });

  it('caso normal: sem excedente, nenhum ciclo é marcado como reduzido', () => {
    const r = simularMetaPrazo(params({ excedenteCicloAtualCents: 0 }));

    expect(r.ciclos.every((c) => c.reduzidoPorGastoExcedente === false)).toBe(true);
    expect(r.totalAcumulavelCents).toBe(10_800_000);
  });

  it('sem ciclo aberto (excedente null) também não marca nem reduz ninguém', () => {
    const r = simularMetaPrazo(params({ excedenteCicloAtualCents: null }));

    expect(r.ciclos.every((c) => c.reduzidoPorGastoExcedente === false)).toBe(true);
    expect(r.totalAcumulavelCents).toBe(10_800_000);
  });

  it('o excedente pode zerar ou virar o aporte do ciclo atual negativo', () => {
    // Gasto muito acima da verba: a poupança daquele ciclo não só some, ela
    // fica devendo. Cortar em zero esconderia o buraco de quem pergunta.
    const r = simularMetaPrazo(params({ excedenteCicloAtualCents: 2_000_000 }));

    expect(r.ciclos[0]?.aportePrevistoCents).toBe(-200_000);
    expect(r.ciclos[0]?.reduzidoPorGastoExcedente).toBe(true);
    expect(r.totalAcumulavelCents).toBe(10_800_000 - 2_000_000);
  });

  it('aporteDisponivelPadrao ignora o ajuste — é a referência de "quanto normalmente sobra"', () => {
    const r = simularMetaPrazo(params({ excedenteCicloAtualCents: 50_000 }));

    expect(r.aporteDisponivelPadraoCents).toBe(1_800_000);
    expect(r.ciclos[0]?.aportePrevistoCents).not.toBe(r.aporteDisponivelPadraoCents);
  });

  it('com um único ciclo, o padrão vem dele mesmo, sem o ajuste aplicado', () => {
    const r = simularMetaPrazo(
      params({
        dataLimite: '2026-08-31',
        excedenteCicloAtualCents: 50_000,
      }),
    );

    expect(r.numCiclos).toBe(1);
    expect(r.aporteDisponivelPadraoCents).toBe(1_800_000);
    expect(r.ciclos[0]?.aportePrevistoCents).toBe(1_750_000);
  });

  it('ciclos com poupança-alvo diferente entre si somam cada um o seu', () => {
    const r = simularMetaPrazo(
      params({
        ciclos: [
          { inicio: '2026-08-01', fim: '2026-08-31', poupancaAlvoCents: 1_000_000 },
          { inicio: '2026-09-01', fim: '2026-09-30', poupancaAlvoCents: 1_500_000 },
          { inicio: '2026-10-01', fim: '2026-10-31', poupancaAlvoCents: 2_000_000 },
        ],
        dataLimite: '2026-10-31',
        excedenteCicloAtualCents: 100_000,
      }),
    );

    expect(r.ciclos.map((c) => c.aportePrevistoCents)).toEqual([900_000, 1_500_000, 2_000_000]);
    expect(r.totalAcumulavelCents).toBe(4_400_000);
    // O "padrão" é o SEGUNDO ciclo quando ele existe: o atual pode estar
    // ajustado e não representa o normal.
    expect(r.aporteDisponivelPadraoCents).toBe(1_500_000);
  });
});

/**
 * D-15: número derivado viaja com suas partes. Se a soma dos aportes exibidos
 * não recompuser o total, o dono vê a lista discordando do resumo — e é a lista
 * que ele confere.
 */
describe('simularMetaPrazo — coerência entre derivados e partes (D-15)', () => {
  it.each([
    ['sem ajuste', null],
    ['com ajuste do ciclo atual', 137_53],
  ] as const)('a soma dos aportes é exatamente totalAcumulavel (%s)', (_caso, excedente) => {
    const r = simularMetaPrazo(params({ excedenteCicloAtualCents: excedente }));

    const soma = r.ciclos.reduce((acc, c) => acc + c.aportePrevistoCents, 0);
    expect(soma).toBe(r.totalAcumulavelCents);
    expect(r.ciclos).toHaveLength(r.numCiclos);
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
    const r = simularMetaPrazo(params({ excedenteCicloAtualCents: 137_53 }));

    const inteiros = [
      r.alvoCents,
      r.totalAcumulavelCents,
      r.aportePorCicloNecessarioCents,
      r.aporteDisponivelPadraoCents,
      r.sobraPorCicloCents,
      ...r.ciclos.map((c) => c.aportePrevistoCents),
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

  it('excedente não inteiro é recusado', () => {
    expect(() => simularMetaPrazo(params({ excedenteCicloAtualCents: 10.5 }))).toThrow(TypeError);
  });

  it('data-limite fora do formato civil é recusada', () => {
    expect(() => simularMetaPrazo(params({ dataLimite: '31/01/2027' }))).toThrow();
  });
});

/**
 * Números reais do dono (CLAUDE.md, "Estado atual"): renda R$ 30.000,00 e meta
 * de poupança R$ 18.000,00 por ciclo. É o caso que gerou a função.
 */
describe('simularMetaPrazo — caso real: juntar R$ 70.000,00 até janeiro', () => {
  const DONO = params({
    alvoCents: 7_000_000,
    dataLimite: '2027-01-31',
    ciclos: ciclosMensais(CICLOS_ATE_JANEIRO, 1_800_000),
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

  it('com o ciclo atual estourado em R$ 2.000,00, o plano continua alcançando — mas dizendo o que mudou', () => {
    const r = simularMetaPrazo({ ...DONO, excedenteCicloAtualCents: 200_000 });

    expect(r.ciclos[0]?.reduzidoPorGastoExcedente).toBe(true);
    expect(r.ciclos[0]?.aportePrevistoCents).toBe(1_600_000); // R$ 16.000,00
    expect(r.totalAcumulavelCents).toBe(10_600_000); // R$ 106.000,00
    expect(r.alcanca).toBe(true);
  });
});
