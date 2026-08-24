import { describe, it, expect } from 'vitest';
import {
  destinoDaRenda,
  razaoPercentual,
  ROTULO_BLOCO,
  ROTULO_SUBDIVISAO,
  type EntradaDestinoDaRenda,
  type LancamentoDoCiclo,
} from './destino-da-renda';

// ── Números REAIS do dono (CLAUDE.md, "em uso real") ───────────────────────
const RENDA = 3_000_000; // R$ 30.000,00
const META_POUPANCA = 1_800_000; // R$ 18.000,00
const FIXOS = 488_400; // R$ 4.884,00
const PARCELAS = 439_388; // R$ 4.393,88
const PROVISAO = 50_000; // R$ 500,00
const VERBA = RENDA - META_POUPANCA - FIXOS - PROVISAO; // R$ 6.616,00

const HOJE = '2026-08-24';
const FIM = '2026-08-31';

function parcela(valorCents: number, extras: Partial<LancamentoDoCiclo> = {}): LancamentoDoCiclo {
  return {
    data: '2026-08-10',
    valorCents,
    tipo: 'DESPESA',
    grupoCategoria: 'VARIAVEL',
    provisaoId: null,
    categoriaId: null,
    parcelamentoId: 'pcl-1',
    ...extras,
  };
}

function gasto(valorCents: number, extras: Partial<LancamentoDoCiclo> = {}): LancamentoDoCiclo {
  return {
    data: '2026-08-05',
    valorCents,
    tipo: 'DESPESA',
    grupoCategoria: 'VARIAVEL',
    provisaoId: null,
    categoriaId: 'cat-mercado',
    parcelamentoId: null,
    ...extras,
  };
}

function entradaBase(over: Partial<EntradaDestinoDaRenda> = {}): EntradaDestinoDaRenda {
  return {
    hoje: HOJE,
    fimDoCiclo: FIM,
    rendaPrevistaCents: RENDA,
    poupancaAlvoCents: META_POUPANCA,
    fixosCents: FIXOS,
    provisaoMensalCents: PROVISAO,
    verbaVariavelCents: VERBA,
    rolloverRecebidoCents: 0,
    puxadoDaReservaForaDaRendaCents: 0,
    custosFixos: [{ valorCents: FIXOS, categoriaId: 'cat-moradia' }],
    lancamentos: [parcela(PARCELAS)],
    ...over,
  };
}

function somaDosBlocos(blocos: readonly { valorCents: number }[]): number {
  return blocos.reduce((total, b) => total + b.valorCents, 0);
}

describe('destinoDaRenda — os blocos de topo fecham em 100% da renda (§12.4)', () => {
  it('fecha exatamente com os números reais do dono', () => {
    const destino = destinoDaRenda(entradaBase());

    expect(somaDosBlocos(destino.blocos)).toBe(RENDA);
    expect(destino.somaDosBlocosCents).toBe(RENDA);
    expect(destino.naoExplicadoCents).toBe(0);
    expect(destino.motivoNaoExplicado).toBeNull();
  });

  it('fecha com rollover POSITIVO — que entra invertido, por não ter vindo desta renda', () => {
    const rollover = 30_000;
    const destino = destinoDaRenda(
      entradaBase({ rolloverRecebidoCents: rollover, verbaVariavelCents: VERBA + rollover }),
    );

    const ajuste = destino.blocos.find((b) => b.chave === 'AJUSTE_ROLLOVER');
    expect(ajuste?.valorCents).toBe(-rollover);
    expect(somaDosBlocos(destino.blocos)).toBe(RENDA);
    expect(destino.naoExplicadoCents).toBe(0);
  });

  it('fecha com rollover NEGATIVO — sobra negativa herdada consome renda deste ciclo', () => {
    const rollover = -30_000;
    const destino = destinoDaRenda(
      entradaBase({ rolloverRecebidoCents: rollover, verbaVariavelCents: VERBA + rollover }),
    );

    const ajuste = destino.blocos.find((b) => b.chave === 'AJUSTE_ROLLOVER');
    expect(ajuste?.valorCents).toBe(30_000);
    expect(somaDosBlocos(destino.blocos)).toBe(RENDA);
    // 🔴 A asserção que MORDE. `somaDosBlocos === RENDA` é tautológico:
    // `naoExplicadoCents` é calculado como a diferença e empurrado na lista,
    // então a soma fecha mesmo com o sinal do rollover invertido. Só
    // `naoExplicadoCents === 0` reprova essa troca.
    expect(destino.naoExplicadoCents).toBe(0);
  });
});

describe('destinoDaRenda — 🔴 puxada da reserva: fonte externa com bloco próprio', () => {
  const PUXADA = 100_000; // R$ 1.000,00

  it('fecha quando a poupança-alvo COMPORTA a puxada — nada veio de fora', () => {
    // `puxarDaReserva`: poupança −X, verba +X. Com poupança suficiente, os dois
    // movimentos se cancelam: o disponível cresceu com dinheiro que ESTA renda
    // ia poupar. O excedente fora da renda é zero, e a identidade já fechava.
    const destino = destinoDaRenda(
      entradaBase({
        poupancaAlvoCents: META_POUPANCA - PUXADA,
        verbaVariavelCents: VERBA + PUXADA,
        puxadoDaReservaForaDaRendaCents: 0,
      }),
    );

    expect(destino.naoExplicadoCents).toBe(0);
    expect(destino.motivoNaoExplicado).toBeNull();
    expect(somaDosBlocos(destino.blocos)).toBe(RENDA);
  });

  it('fecha quando a poupança-alvo NÃO comporta a puxada (piso em zero)', () => {
    // O caso que produzia "diferença não explicada" NEGATIVA: a poupança desce
    // só até zero, a verba sobe o valor CHEIO, e a soma dos blocos passa da
    // renda em (puxada − poupançaAlvo). Esse excedente veio da reserva —
    // dinheiro real, com lastro — e agora é declarado em vez de virar resíduo.
    const puxada = META_POUPANCA + 100;
    const foraDaRenda = puxada - META_POUPANCA; // 100: o que a poupança não cobriu
    const destino = destinoDaRenda(
      entradaBase({
        poupancaAlvoCents: 0,
        verbaVariavelCents: VERBA + puxada,
        puxadoDaReservaForaDaRendaCents: foraDaRenda,
      }),
    );

    expect(destino.naoExplicadoCents).toBe(0);
    expect(destino.motivoNaoExplicado).toBeNull();
    expect(somaDosBlocos(destino.blocos)).toBe(RENDA);
  });

  it('entra INVERTIDO, com nota dizendo por que o sinal é negativo', () => {
    const destino = destinoDaRenda(
      entradaBase({
        poupancaAlvoCents: 0,
        verbaVariavelCents: VERBA + META_POUPANCA + PUXADA,
        puxadoDaReservaForaDaRendaCents: PUXADA,
      }),
    );

    const bloco = destino.blocos.find((b) => b.chave === 'PUXADA_DA_RESERVA');
    expect(bloco?.valorCents).toBe(-PUXADA);
    expect(bloco?.nota).toContain('não veio desta renda');
    expect(destino.naoExplicadoCents).toBe(0);
  });

  it('sem puxada o bloco fica zerado e sem nota — nada a explicar', () => {
    const bloco = destinoDaRenda(entradaBase()).blocos.find(
      (b) => b.chave === 'PUXADA_DA_RESERVA',
    );

    expect(bloco?.valorCents).toBe(0);
    expect(bloco?.nota).toBeNull();
  });

  it('mantém a rede de segurança: número gravado fora de qualquer fonte conhecida ainda aparece', () => {
    // Nenhuma fonte externa declarada e a verba mesmo assim não bate: é a porta
    // do import de backup adulterado, e ela continua exposta (D-14).
    const destino = destinoDaRenda(entradaBase({ verbaVariavelCents: VERBA + 100 }));

    expect(destino.naoExplicadoCents).toBe(-100);
    expect(destino.motivoNaoExplicado).toContain('backup');
    expect(somaDosBlocos(destino.blocos)).toBe(RENDA);
  });
});

describe('destinoDaRenda — 🔴 guarda da D-11: parcela não é bloco de topo', () => {
  it('nenhum bloco de topo é "Parcelamentos do ciclo"', () => {
    const destino = destinoDaRenda(entradaBase());

    expect(destino.blocos.map((b) => b.rotulo)).not.toContain(
      ROTULO_SUBDIVISAO.PARCELAMENTOS_DO_CICLO,
    );
    expect(destino.blocos.map((b) => b.chave)).toEqual([
      'POUPANCA',
      'CUSTOS_FIXOS',
      'PROVISAO',
      'AJUSTE_ROLLOVER',
      'PUXADA_DA_RESERVA',
      'DISPONIVEL_PARA_GASTAR',
    ]);
  });

  it('FALHA se as parcelas forem somadas ao lado dos blocos: dupla contagem', () => {
    const destino = destinoDaRenda(entradaBase());
    const parcelas = destino.disponivelParaGastar.parcelamentosDoCicloCents;

    expect(parcelas).toBe(PARCELAS);
    // A soma correta fecha na renda...
    expect(somaDosBlocos(destino.blocos)).toBe(RENDA);
    // ...e promover "Parcelamentos" a bloco irmão estouraria em exatamente
    // R$ 4.393,88 — o mesmo dinheiro contado duas vezes (D-11).
    expect(somaDosBlocos(destino.blocos) + parcelas).toBe(RENDA + PARCELAS);
    expect(somaDosBlocos(destino.blocos) + parcelas).not.toBe(RENDA);
  });

  it('as parcelas estão DENTRO de "Disponível para gastar"', () => {
    const destino = destinoDaRenda(entradaBase());
    const disponivel = destino.blocos.find((b) => b.chave === 'DISPONIVEL_PARA_GASTAR');

    expect(disponivel?.valorCents).toBe(VERBA);
    expect(somaDosBlocos(destino.disponivelParaGastar.subdivisoes)).toBe(VERBA);
  });
});

describe('destinoDaRenda — parcelamentos e gastos eventuais são duas linhas (§12.2.1)', () => {
  it('devolve duas subdivisões distintas, nunca um total único', () => {
    const destino = destinoDaRenda(entradaBase());
    const { subdivisoes, parcelamentosDoCicloCents, gastosEventuaisDoMesCents } =
      destino.disponivelParaGastar;

    expect(subdivisoes).toHaveLength(2);
    expect(subdivisoes.map((s) => s.chave)).toEqual([
      'PARCELAMENTOS_DO_CICLO',
      'GASTOS_EVENTUAIS_DO_MES',
    ]);
    expect(parcelamentosDoCicloCents).toBe(PARCELAS);
    expect(gastosEventuaisDoMesCents).toBe(VERBA - PARCELAS);
    expect(parcelamentosDoCicloCents + gastosEventuaisDoMesCents).toBe(VERBA);
  });

  it('separa realizado, programado e o que ainda não tem destino', () => {
    const destino = destinoDaRenda(
      entradaBase({
        lancamentos: [
          parcela(PARCELAS),
          gasto(20_000, { data: '2026-08-05' }), // realizado
          gasto(5_000, { data: '2026-08-06', tipo: 'ESTORNO' }), // abate o realizado
          gasto(30_000, { data: '2026-08-28' }), // competência futura no ciclo
        ],
      }),
    );

    const d = destino.disponivelParaGastar;
    expect(d.realizadoAteHojeCents).toBe(15_000);
    expect(d.programadoNoCicloCents).toBe(30_000);
    expect(d.aindaSemDestinoCents).toBe(d.gastosEventuaisDoMesCents - 45_000);
  });

  it('não conta como gasto eventual o que não consome verba (provisão, transferência, grupo FIXO)', () => {
    const destino = destinoDaRenda(
      entradaBase({
        lancamentos: [
          gasto(10_000, { provisaoId: 'prov-1' }),
          gasto(10_000, { tipo: 'TRANSFERENCIA' }),
          gasto(10_000, { grupoCategoria: 'FIXO' }),
          gasto(7_000),
        ],
      }),
    );

    expect(destino.disponivelParaGastar.realizadoAteHojeCents).toBe(7_000);
  });
});

describe('destinoDaRenda — rótulos do dono, nunca os nomes do motor (§12.2.1)', () => {
  it('não vaza "verbaVariavel" nem "verbaLivre" em nenhum rótulo exibível', () => {
    const destino = destinoDaRenda(entradaBase());
    const rotulos = [
      ...destino.blocos.map((b) => b.rotulo),
      ...destino.disponivelParaGastar.subdivisoes.map((s) => s.rotulo),
    ];

    for (const rotulo of rotulos) {
      expect(rotulo).not.toMatch(/verbaVariavel|verbaLivre/i);
    }
    expect(rotulos).toContain(ROTULO_BLOCO.DISPONIVEL_PARA_GASTAR);
    expect(rotulos).toContain(ROTULO_SUBDIVISAO.GASTOS_EVENTUAIS_DO_MES);
  });
});

describe('destinoDaRenda — custo fixo sem categoria aparece, com contagem (D-14)', () => {
  it('agrupa os sem categoria numa linha própria, com quantidade', () => {
    const destino = destinoDaRenda(
      entradaBase({
        custosFixos: [
          { valorCents: 200_000, categoriaId: null },
          { valorCents: 188_400, categoriaId: null },
          { valorCents: 100_000, categoriaId: 'cat-moradia' },
        ],
      }),
    );

    const semCategoria = destino.porCategoria.find((l) => l.categoriaId === null);
    expect(semCategoria?.partes.custoFixoCents).toBe(388_400);
    expect(semCategoria?.quantidade.custosFixos).toBe(2);
    expect(destino.custosFixos.semCategoria).toEqual({ quantidade: 2, totalCents: 388_400 });
    expect(destino.custosFixos.quantidadeCadastrada).toBe(3);
  });

  it('reporta a divergência entre o cadastro de hoje e o valor congelado no ciclo', () => {
    const destino = destinoDaRenda(
      entradaBase({ custosFixos: [{ valorCents: 500_000, categoriaId: null }] }),
    );

    expect(destino.custosFixos.congeladoNoCicloCents).toBe(FIXOS);
    expect(destino.custosFixos.cadastradosHojeCents).toBe(500_000);
    expect(destino.custosFixos.diferencaCents).toBe(500_000 - FIXOS);
    expect(destino.custosFixos.motivoDiferenca).toContain('CONGELADO');
    // O bloco continua valendo o congelado — regra 3.
    expect(destino.blocos.find((b) => b.chave === 'CUSTOS_FIXOS')?.valorCents).toBe(FIXOS);
  });
});

describe('destinoDaRenda — 🔴 §12.4.1: a agregação carrega a origem de cada parcela do total', () => {
  it('separa custo fixo de gasto eventual dentro da MESMA categoria', () => {
    // O cenário concreto da §12.4.1: um custo fixo classificado em "Mercado",
    // a mesma categoria em que caem compras de verba variável.
    const destino = destinoDaRenda(
      entradaBase({
        custosFixos: [{ valorCents: 120_000, categoriaId: 'cat-mercado' }],
        lancamentos: [gasto(80_000, { categoriaId: 'cat-mercado' })],
      }),
    );

    const mercado = destino.porCategoria.find((l) => l.categoriaId === 'cat-mercado');
    expect(mercado?.totalCents).toBe(200_000);
    expect(mercado?.partes.custoFixoCents).toBe(120_000);
    expect(mercado?.partes.gastoEventualRealizadoCents).toBe(80_000);
    expect(mercado?.quantidade).toEqual({
      custosFixos: 1,
      parcelas: 0,
      gastosEventuais: 1,
      gastosEventuaisRealizados: 1,
      gastosEventuaisProgramados: 0,
    });
    expect(mercado?.origens).toEqual(['CUSTO_FIXO', 'GASTO_EVENTUAL']);
    expect(mercado?.misturaOrigens).toBe(true);
    expect(destino.categoriasComMisturaDeOrigem).toHaveLength(1);
  });

  it('🔴 parcela + gasto eventual na MESMA categoria NÃO é mistura', () => {
    // O falso positivo que fazia o aviso disparar em quase toda categoria: a
    // parcela do celular e um cabo avulso em "Eletrônicos". As duas são
    // despesas de grupo VARIAVEL que consomem o mesmo teto (D-11), então o
    // total delas É o gasto de verba da categoria — nada foi misturado, e o
    // banner que dizia "não é gasto de verba nem custo fixo" era falso.
    const destino = destinoDaRenda(
      entradaBase({
        custosFixos: [],
        lancamentos: [
          parcela(100_000, { categoriaId: 'cat-eletronicos' }),
          gasto(25_000, { categoriaId: 'cat-eletronicos' }),
        ],
      }),
    );

    const linha = destino.porCategoria.find((l) => l.categoriaId === 'cat-eletronicos');
    expect(linha?.origens).toEqual(['PARCELAMENTO', 'GASTO_EVENTUAL']);
    expect(linha?.misturaOrigens).toBe(false);
    expect(destino.categoriasComMisturaDeOrigem).toHaveLength(0);
  });

  it('custo fixo + PARCELA na mesma categoria é mistura — parcela também é gasto de verba', () => {
    const destino = destinoDaRenda(
      entradaBase({
        custosFixos: [{ valorCents: 120_000, categoriaId: 'cat-eletronicos' }],
        lancamentos: [parcela(100_000, { categoriaId: 'cat-eletronicos' })],
      }),
    );

    const linha = destino.porCategoria.find((l) => l.categoriaId === 'cat-eletronicos');
    expect(linha?.misturaOrigens).toBe(true);
  });

  it('conta realizados e programados separadamente — cada contagem rotula seu próprio valor', () => {
    const destino = destinoDaRenda(
      entradaBase({
        custosFixos: [],
        lancamentos: [
          gasto(20_000, { data: '2026-08-05', categoriaId: 'cat-mercado' }),
          gasto(30_000, { data: '2026-08-28', categoriaId: 'cat-mercado' }),
        ],
      }),
    );

    const linha = destino.porCategoria.find((l) => l.categoriaId === 'cat-mercado');
    expect(linha?.quantidade.gastosEventuaisRealizados).toBe(1);
    expect(linha?.quantidade.gastosEventuaisProgramados).toBe(1);
    expect(linha?.quantidade.gastosEventuais).toBe(2);
    expect(linha?.partes.gastoEventualRealizadoCents).toBe(20_000);
    expect(linha?.partes.gastoEventualProgramadoCents).toBe(30_000);
  });

  it('categoria de uma origem só não é marcada como mistura', () => {
    const destino = destinoDaRenda(
      entradaBase({
        custosFixos: [{ valorCents: 120_000, categoriaId: 'cat-moradia' }],
        lancamentos: [gasto(80_000, { categoriaId: 'cat-mercado' })],
      }),
    );

    expect(destino.categoriasComMisturaDeOrigem).toHaveLength(0);
    expect(destino.porCategoria.every((l) => l.origens.length === 1)).toBe(true);
  });

  it('parcela é uma origem própria, distinta do gasto eventual', () => {
    const destino = destinoDaRenda(
      entradaBase({
        custosFixos: [],
        lancamentos: [
          parcela(100_000, { categoriaId: 'cat-eletronicos' }),
          gasto(25_000, { categoriaId: 'cat-eletronicos' }),
        ],
      }),
    );

    const linha = destino.porCategoria.find((l) => l.categoriaId === 'cat-eletronicos');
    expect(linha?.partes.parcelamentoCents).toBe(100_000);
    expect(linha?.partes.gastoEventualRealizadoCents).toBe(25_000);
    expect(linha?.origens).toEqual(['PARCELAMENTO', 'GASTO_EVENTUAL']);
  });

  it('ordena da maior para a menor e não perde nenhuma origem no total', () => {
    const destino = destinoDaRenda(
      entradaBase({
        custosFixos: [{ valorCents: 10_000, categoriaId: 'cat-a' }],
        lancamentos: [parcela(50_000, { categoriaId: 'cat-b' }), gasto(30_000, { categoriaId: 'cat-c' })],
      }),
    );

    expect(destino.porCategoria.map((l) => l.categoriaId)).toEqual(['cat-b', 'cat-c', 'cat-a']);
    const soma = destino.porCategoria.reduce((t, l) => t + l.totalCents, 0);
    expect(soma).toBe(90_000);
  });
});

describe('razaoPercentual', () => {
  it('devolve null COM MOTIVO quando a base é zero — nunca divide por zero', () => {
    const razao = razaoPercentual(100, 0);

    expect(razao.valor).toBeNull();
    expect(razao.motivo).toBeTruthy();
  });

  it('devolve null COM MOTIVO quando a base é negativa, em vez de um 0 mudo', () => {
    // Modo recuperação: o disponível do ciclo pode ser negativo por construção
    // (verba.ts). O `0` antigo imprimia "Parcelamentos do ciclo · 0% do
    // disponível" ao lado de R$ 4.393,88 — e o dono não tinha como saber por quê.
    const razao = razaoPercentual(439_388, -100_000);

    expect(razao.valor).toBeNull();
    expect(razao.motivo).toContain('negativa');
  });

  it('arredonda para uma casa decimal e aceita parte negativa', () => {
    expect(razaoPercentual(1_800_000, 3_000_000).valor).toBe(60);
    expect(razaoPercentual(-30_000, 3_000_000).valor).toBe(-1);
    expect(razaoPercentual(1, 3).valor).toBe(33.3);
    expect(razaoPercentual(1_800_000, 3_000_000).motivo).toBeNull();
  });
});

describe('destinoDaRenda — validação de entrada', () => {
  it('recusa centavos fracionários', () => {
    expect(() => destinoDaRenda(entradaBase({ rendaPrevistaCents: 100.5 }))).toThrow(TypeError);
  });

  it('recusa data civil malformada', () => {
    expect(() => destinoDaRenda(entradaBase({ hoje: '24/08/2026' }))).toThrow(TypeError);
  });

  it('sem lançamento nenhum, tudo que é disponível ainda não tem destino', () => {
    const destino = destinoDaRenda(entradaBase({ lancamentos: [] }));
    const d = destino.disponivelParaGastar;

    expect(d.parcelamentosDoCicloCents).toBe(0);
    expect(d.gastosEventuaisDoMesCents).toBe(VERBA);
    expect(d.aindaSemDestinoCents).toBe(VERBA);
    expect(somaDosBlocos(destino.blocos)).toBe(RENDA);
    expect(destino.naoExplicadoCents).toBe(0);
  });
});
