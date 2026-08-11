/**
 * Testes dos casos de uso de parcelamento (TASKS-CUSTOS Fase 5 — a mais
 * arriscada do plano: apaga `Transacao` que podem estar pagas ou em ciclo
 * fechado). Cobre R1 (passado é congelado) e R2 (retroatividade passa pela
 * guarda), além do rateio de `editarParcelamento` e da idempotência de
 * `encerrarParcelamento`. Usa fakes em memória; nunca toca no banco.
 */
import { describe, it, expect } from 'vitest';
import {
  criarDeps as criarDepsFake,
  cicloFake,
  contaFake,
  transacaoFake,
  provisaoFake,
  CATEGORIA_VARIAVEL,
  CATEGORIA_FIXA,
} from './__fakes__/fakes-ciclo-fechamento';
import { criarParcelamento } from './transacoes';
import {
  listarParcelamentos,
  encerrarParcelamento,
  editarParcelamento,
  previaEncerramentoParcelamento,
  ParcelamentoImutavelError,
  ParcelamentoEncerradoError,
  CategoriaInvalidaParaParcelaError,
} from './parcelamentos';
import { CicloFechadoError } from './retroatividade';

const CICLO_ABERTO_ID = 'ciclo-aberto';
const CICLO_FECHADO_ID = 'ciclo-fechado';

function cicloAbertoFake(patch: Partial<ReturnType<typeof cicloFake>> = {}) {
  return cicloFake({
    id: CICLO_ABERTO_ID,
    dataInicio: '2026-07-05',
    dataFim: '2026-08-04',
    verbaVariavelCents: 500_000,
    fechado: false,
    fechadoEm: null,
    sobraCents: null,
    ...patch,
  });
}

/** Ciclo fechado de fevereiro/2026 — não cobre "hoje" (2026-07-20). */
function cicloFechadoFake(patch: Partial<ReturnType<typeof cicloFake>> = {}) {
  return cicloFake({
    id: CICLO_FECHADO_ID,
    dataInicio: '2026-02-05',
    dataFim: '2026-03-04',
    verbaVariavelCents: 500_000,
    fechado: true,
    fechadoEm: '2026-03-05',
    sobraCents: 999_999, // desatualizado de propósito — deve ser recalculado se tocado
    ...patch,
  });
}

describe('encerrarParcelamento — cancelamento antecipado (R1)', () => {
  it('preserva toda parcela paga intacta e apaga só as não pagas fora de ciclo fechado', async () => {
    const deps = criarDepsFake({ hoje: '2026-07-20', ciclos: [cicloAbertoFake()] });

    const parcelas = await criarParcelamento(deps, {
      descricao: 'Notebook',
      valorTotalCents: 1_200_00,
      numParcelas: 12,
      dataCompra: '2026-01-05',
      categoriaId: CATEGORIA_VARIAVEL.id,
    });
    expect(parcelas).toHaveLength(12);
    const parcelamentoId = parcelas[0]!.parcelamentoId!;

    // Marca as 5 primeiras (jan–mai) como pagas.
    for (const p of parcelas.slice(0, 5)) {
      await deps.transacoes.marcarPaga(p.id, p.data);
    }

    // Das 7 não pagas restantes (jun–dez), só as estritamente futuras em
    // relação a "hoje" (2026-07-20) são apagáveis: ago–dez (5). jun (06-05)
    // e jul (07-05) já venceram e não foram marcadas — ficam preservadas
    // também, pela regra "futura" (achado MÉDIO #4).
    const resultado = await encerrarParcelamento(deps, parcelamentoId);

    expect(resultado.parcelasCanceladas).toBe(5);
    expect(resultado.parcelasPreservadas).toBe(7);

    const restantes = await deps.transacoes.listarPorParcelamento(parcelamentoId);
    expect(restantes).toHaveLength(7);
    const restantesPagas = restantes.filter((t) => t.pagoEm != null);
    expect(restantesPagas).toHaveLength(5);
    const restantesVencidasNaoPagas = restantes.filter((t) => t.pagoEm == null);
    expect(restantesVencidasNaoPagas.map((t) => t.data).sort()).toEqual(['2026-06-05', '2026-07-05']);

    // Valor, data e pagoEm das pagas seguem exatamente os originais.
    for (const [i, original] of parcelas.slice(0, 5).entries()) {
      const preservada = restantes.find((t) => t.id === original.id);
      expect(preservada).toMatchObject({
        valorCents: original.valorCents,
        data: original.data,
        pagoEm: original.data,
      });
      expect(preservada?.parcelaNum).toBe(i + 1);
    }

    const parcelamento = await deps.parcelamentos.obter(parcelamentoId);
    expect(parcelamento?.encerradoEm).toBe('2026-07-20');
  });

  it('parcela em ciclo fechado nunca é apagada, mesmo não paga', async () => {
    const deps = criarDepsFake({
      hoje: '2026-07-20',
      ciclos: [cicloAbertoFake(), cicloFechadoFake()],
    });

    const parcelas = await criarParcelamento(deps, {
      descricao: 'Geladeira',
      valorTotalCents: 800_00,
      numParcelas: 8,
      dataCompra: '2026-02-05', // 1ª parcela cai no ciclo fechado (fev)
      categoriaId: CATEGORIA_VARIAVEL.id,
    });
    const parcelamentoId = parcelas[0]!.parcelamentoId!;
    const parcelaCicloFechado = parcelas[0]!;
    expect(parcelaCicloFechado.cicloId).toBe(CICLO_FECHADO_ID);
    expect(parcelaCicloFechado.pagoEm).toBeNull(); // não paga, mas protegida pelo ciclo fechado

    // mar–jul (5 parcelas) não pagas mas já vencidas em relação a "hoje"
    // (2026-07-20) — preservadas pela regra "futura" (achado MÉDIO #4), não
    // pelo ciclo fechado. Só ago e set (2) são estritamente futuras.
    // Sem confirmarRetroativo: a checagem defensiva nem dispara, porque a
    // parcela de ciclo fechado nunca entra no conjunto a apagar.
    const resultado = await encerrarParcelamento(deps, parcelamentoId);

    expect(resultado.parcelasCanceladas).toBe(2);
    expect(resultado.parcelasPreservadas).toBe(6);

    const restante = await deps.transacoes.obter(parcelaCicloFechado.id);
    expect(restante).not.toBeNull();
    expect(restante?.valorCents).toBe(parcelaCicloFechado.valorCents);
  });

  it('R1 — ciclo fechado que cobre "hoje": nenhuma parcela nele é apagada', async () => {
    // Regressão: um teste de R1 anterior usava um ciclo fechado que não
    // cobria a data do relógio fake, o que não pegaria um bug em que a
    // guarda tratasse "hoje" como implicitamente aberto.
    const cicloFechadoHoje = cicloFake({
      id: 'ciclo-fechado-hoje',
      dataInicio: '2026-06-01',
      dataFim: '2026-09-30',
      verbaVariavelCents: 500_000,
      fechado: true,
      fechadoEm: '2026-07-20',
      sobraCents: 999_999,
    });
    const deps = criarDepsFake({ hoje: '2026-07-20', ciclos: [cicloFechadoHoje] });

    const parcelas = await criarParcelamento(deps, {
      descricao: 'Celular',
      valorTotalCents: 300_00,
      numParcelas: 3,
      dataCompra: '2026-07-05',
      categoriaId: CATEGORIA_VARIAVEL.id,
    });
    expect(parcelas.every((p) => p.cicloId === 'ciclo-fechado-hoje')).toBe(true);
    const parcelamentoId = parcelas[0]!.parcelamentoId!;

    const resultado = await encerrarParcelamento(deps, parcelamentoId);

    expect(resultado.parcelasCanceladas).toBe(0);
    expect(resultado.parcelasPreservadas).toBe(3);
    const restantes = await deps.transacoes.listarPorParcelamento(parcelamentoId);
    expect(restantes).toHaveLength(3);
  });

  it('efeito de saldo revertido: a conta volta ao saldo esperado após encerrar', async () => {
    const deps = criarDepsFake({
      hoje: '2026-07-20',
      ciclos: [cicloAbertoFake()],
      contas: [contaFake({ id: 'conta-1', saldoCents: 100_000 })],
    });

    const parcelamento = await deps.parcelamentos.criar({
      id: '',
      descricao: 'TV',
      valorTotalCents: 30_000,
      numParcelas: 3,
      dataCompra: '2026-08-05',
      categoriaId: CATEGORIA_VARIAVEL.id,
      encerradoEm: null,
    });

    for (let i = 1; i <= 3; i += 1) {
      const t = await deps.transacoes.criar(
        transacaoFake({
          id: '',
          // Estritamente futura em relação a "hoje" (2026-07-20) — do
          // contrário a regra "futura" (achado MÉDIO #4) preservaria a
          // parcela e o saldo não voltaria ao original neste teste.
          data: '2026-08-05',
          valorCents: 10_000,
          contaId: 'conta-1',
          parcelamentoId: parcelamento.id,
          parcelaNum: i,
          cicloId: CICLO_ABERTO_ID,
          pagoEm: null,
        }),
      );
      // Simula o efeito que `criarTransacao`/`criarParcelamento` já teriam
      // aplicado na criação: DESPESA com contaId subtrai do saldo.
      await deps.contas.ajustarSaldo(t.contaId!, -t.valorCents);
    }
    expect(deps.contas.saldoDe('conta-1')).toBe(70_000);

    await encerrarParcelamento(deps, parcelamento.id);

    // Nenhuma das 3 parcelas estava paga nem em ciclo fechado: as 3 foram
    // canceladas e o efeito de saldo revertido devolve os 30.000.
    expect(deps.contas.saldoDe('conta-1')).toBe(100_000);
  });

  it('efeito de provisão revertido: acumuladoCents volta ao esperado após encerrar', async () => {
    const deps = criarDepsFake({
      hoje: '2026-07-20',
      ciclos: [cicloAbertoFake()],
      provisoes: [provisaoFake({ id: 'prov-1', acumuladoCents: 50_000 })],
    });

    // `criarParcelamento` (transacoes.ts) não aceita `provisaoId` no input —
    // monta as transações diretamente, como o teste de saldo acima, e
    // simula o efeito que a criação real teria aplicado.
    const parcelamento = await deps.parcelamentos.criar({
      id: '',
      descricao: 'Presente de fim de ano',
      valorTotalCents: 30_000,
      numParcelas: 3,
      dataCompra: '2026-08-05',
      categoriaId: CATEGORIA_VARIAVEL.id,
      encerradoEm: null,
    });

    for (let i = 1; i <= 3; i += 1) {
      const t = await deps.transacoes.criar(
        transacaoFake({
          id: '',
          // Estritamente futura em relação a "hoje" (2026-07-20) — ver
          // comentário equivalente no teste de saldo revertido acima.
          data: '2026-08-05',
          valorCents: 10_000,
          provisaoId: 'prov-1',
          parcelamentoId: parcelamento.id,
          parcelaNum: i,
          cicloId: CICLO_ABERTO_ID,
          pagoEm: null,
        }),
      );
      // Espelha `aplicarEfeitoProvisao(deps, t, +1)`: DESPESA com provisaoId
      // ABATE o acumulado na criação (`-valorCents`), nunca soma.
      await deps.provisoes.ajustarAcumulado(t.provisaoId!, -t.valorCents);
    }
    expect(deps.provisoes.acumuladoDe('prov-1')).toBe(20_000);

    await encerrarParcelamento(deps, parcelamento.id);

    // Nenhuma das 3 parcelas estava paga nem em ciclo fechado: as 3 foram
    // canceladas e o efeito de provisão revertido (`sinal -1` devolve)
    // restaura o acumulado original de 50_000.
    expect(deps.provisoes.acumuladoDe('prov-1')).toBe(50_000);
  });

  it('é idempotente: encerrar de novo um parcelamento já encerrado não apaga nada', async () => {
    const deps = criarDepsFake({ hoje: '2026-07-20', ciclos: [cicloAbertoFake()] });

    const parcelas = await criarParcelamento(deps, {
      descricao: 'Sofá',
      valorTotalCents: 400_00,
      numParcelas: 4,
      dataCompra: '2026-08-05', // todas estritamente futuras em relação a "hoje" (2026-07-20)
      categoriaId: CATEGORIA_VARIAVEL.id,
    });
    const parcelamentoId = parcelas[0]!.parcelamentoId!;

    const primeira = await encerrarParcelamento(deps, parcelamentoId);
    expect(primeira.parcelasCanceladas).toBe(4);

    const segunda = await encerrarParcelamento(deps, parcelamentoId);
    expect(segunda.parcelasCanceladas).toBe(0);
    expect(segunda.parcelasPreservadas).toBe(0); // as 4 já tinham sido apagadas na 1ª chamada
  });
});

describe('listarParcelamentos — resumo agregado a partir das parcelas reais', () => {
  it('deriva terminaEm, parcelasPagas/total, valorRestanteCents e encerradoEm', async () => {
    const deps = criarDepsFake({ hoje: '2026-07-20', ciclos: [cicloAbertoFake()] });

    const parcelas = await criarParcelamento(deps, {
      descricao: 'Fogão',
      valorTotalCents: 349_900,
      numParcelas: 12,
      dataCompra: '2026-07-05',
      categoriaId: CATEGORIA_VARIAVEL.id,
    });
    await deps.transacoes.marcarPaga(parcelas[0]!.id, parcelas[0]!.data);

    const [resumo] = await listarParcelamentos(deps);

    expect(resumo).toBeDefined();
    expect(resumo!.parcelasTotal).toBe(12);
    expect(resumo!.parcelasPagas).toBe(1);
    expect(resumo!.terminaEm).toBe(parcelas.at(-1)!.data);
    expect(resumo!.encerradoEm).toBeNull();
    expect(resumo!.valorRestanteCents).toBe(
      parcelas.slice(1).reduce((soma, p) => soma + p.valorCents, 0),
    );
  });

  it('terminaEm reflete o encerramento antecipado, não numParcelas original', async () => {
    const deps = criarDepsFake({ hoje: '2026-07-20', ciclos: [cicloAbertoFake()] });

    const parcelas = await criarParcelamento(deps, {
      descricao: 'Bicicleta',
      valorTotalCents: 500_00,
      numParcelas: 5,
      dataCompra: '2026-07-05',
      categoriaId: CATEGORIA_VARIAVEL.id,
    });
    const parcelamentoId = parcelas[0]!.parcelamentoId!;
    await deps.transacoes.marcarPaga(parcelas[0]!.id, parcelas[0]!.data);

    await encerrarParcelamento(deps, parcelamentoId);

    const [resumo] = await listarParcelamentos(deps);
    expect(resumo!.terminaEm).toBe(parcelas[0]!.data); // só a paga restou
    expect(resumo!.parcelasTotal).toBe(1);
    expect(resumo!.encerradoEm).toBe('2026-07-20');
  });
});

describe('editarParcelamento — campos sempre editáveis (descricao/categoria)', () => {
  it('propaga descricao e categoriaId para as parcelas existentes', async () => {
    const deps = criarDepsFake({
      hoje: '2026-07-20',
      ciclos: [cicloAbertoFake()],
      categorias: [CATEGORIA_VARIAVEL, { ...CATEGORIA_VARIAVEL, id: 'cat-nova', nome: 'Casa' }],
    });

    const parcelas = await criarParcelamento(deps, {
      descricao: 'Cadeira',
      valorTotalCents: 300_00,
      numParcelas: 3,
      dataCompra: '2026-07-05',
      categoriaId: CATEGORIA_VARIAVEL.id,
    });
    const parcelamentoId = parcelas[0]!.parcelamentoId!;
    await deps.transacoes.marcarPaga(parcelas[0]!.id, parcelas[0]!.data); // até parcela paga aceita isso

    const editado = await editarParcelamento(deps, parcelamentoId, {
      descricao: 'Cadeira gamer',
      categoriaId: 'cat-nova',
    });

    expect(editado.descricao).toBe('Cadeira gamer');
    expect(editado.categoriaId).toBe('cat-nova');

    const restantes = await deps.transacoes.listarPorParcelamento(parcelamentoId);
    for (const t of restantes) {
      expect(t.categoriaId).toBe('cat-nova');
      expect(t.descricao).toBe(`Cadeira gamer (${t.parcelaNum}/3)`);
    }
  });
});

describe('editarParcelamento — campos financeiros (valor/parcelas/data)', () => {
  it('soma(parcelas) === valorTotalCents após regenerar, mesmo com divisão não exata', async () => {
    const deps = criarDepsFake({ hoje: '2026-07-20', ciclos: [cicloAbertoFake()] });

    const parcelas = await criarParcelamento(deps, {
      descricao: 'Notebook',
      valorTotalCents: 100_000,
      numParcelas: 4,
      dataCompra: '2026-07-05',
      categoriaId: CATEGORIA_VARIAVEL.id,
    });
    const parcelamentoId = parcelas[0]!.parcelamentoId!;

    const editado = await editarParcelamento(deps, parcelamentoId, {
      valorTotalCents: 349_900,
      numParcelas: 12,
    });

    expect(editado.valorTotalCents).toBe(349_900);
    expect(editado.numParcelas).toBe(12);

    const novas = await deps.transacoes.listarPorParcelamento(parcelamentoId);
    expect(novas).toHaveLength(12);
    const soma = novas.reduce((s, t) => s + t.valorCents, 0);
    expect(soma).toBe(349_900);
    // floor(349900/12) = 29158, resto 4 -> última parcela = 29158 + 4 = 29162.
    expect(novas.at(-1)!.valorCents).toBe(29_162);
  });

  it('recusa editar valorTotalCents com parcela paga, sem alterar nada', async () => {
    const deps = criarDepsFake({ hoje: '2026-07-20', ciclos: [cicloAbertoFake()] });

    const parcelas = await criarParcelamento(deps, {
      descricao: 'Geladeira',
      valorTotalCents: 120_000,
      numParcelas: 12,
      dataCompra: '2026-01-05',
      categoriaId: CATEGORIA_VARIAVEL.id,
    });
    const parcelamentoId = parcelas[0]!.parcelamentoId!;
    await deps.transacoes.marcarPaga(parcelas[0]!.id, parcelas[0]!.data);

    await expect(
      editarParcelamento(deps, parcelamentoId, { valorTotalCents: 240_000 }),
    ).rejects.toBeInstanceOf(ParcelamentoImutavelError);

    const depois = await deps.transacoes.listarPorParcelamento(parcelamentoId);
    expect(depois).toHaveLength(12);
    expect(depois.map((t) => t.valorCents)).toEqual(parcelas.map((t) => t.valorCents));
    const parcelamento = await deps.parcelamentos.obter(parcelamentoId);
    expect(parcelamento?.valorTotalCents).toBe(120_000);
  });

  it('recusa editar numParcelas/dataCompra quando há parcela em ciclo fechado, mesmo sem nenhuma paga', async () => {
    const deps = criarDepsFake({
      hoje: '2026-07-20',
      ciclos: [cicloAbertoFake(), cicloFechadoFake()],
    });

    const parcelas = await criarParcelamento(deps, {
      descricao: 'Máquina de lavar',
      valorTotalCents: 600_00,
      numParcelas: 6,
      dataCompra: '2026-02-05', // 1ª parcela cai no ciclo fechado
      categoriaId: CATEGORIA_VARIAVEL.id,
    });
    const parcelamentoId = parcelas[0]!.parcelamentoId!;
    expect(parcelas.some((t) => t.pagoEm != null)).toBe(false);

    await expect(
      editarParcelamento(deps, parcelamentoId, { numParcelas: 8 }),
    ).rejects.toBeInstanceOf(ParcelamentoImutavelError);
  });

  it('dataCompra retroativa para dentro de ciclo fechado exige confirmarRetroativo', async () => {
    const deps = criarDepsFake({
      hoje: '2026-07-20',
      ciclos: [cicloAbertoFake(), cicloFechadoFake()],
    });

    const parcelas = await criarParcelamento(deps, {
      descricao: 'Micro-ondas',
      valorTotalCents: 300_00,
      numParcelas: 3,
      dataCompra: '2026-07-05', // hoje, tudo em ciclo aberto
      categoriaId: CATEGORIA_VARIAVEL.id,
    });
    const parcelamentoId = parcelas[0]!.parcelamentoId!;

    await expect(
      editarParcelamento(deps, parcelamentoId, { dataCompra: '2026-02-05' }),
    ).rejects.toBeInstanceOf(CicloFechadoError);

    // Nada mudou sem a confirmação.
    const inalterado = await deps.transacoes.listarPorParcelamento(parcelamentoId);
    expect(inalterado.map((t) => t.data)).toEqual(parcelas.map((t) => t.data));

    const confirmado = await editarParcelamento(
      deps,
      parcelamentoId,
      { dataCompra: '2026-02-05' },
      true,
    );
    expect(confirmado.dataCompra).toBe('2026-02-05');

    const novas = await deps.transacoes.listarPorParcelamento(parcelamentoId);
    expect(novas[0]!.cicloId).toBe(CICLO_FECHADO_ID);
    // A sobra do ciclo fechado foi recalculada (deixou de ser o valor
    // propositalmente desatualizado do fixture).
    const cicloFechado = await deps.ciclos.obter(CICLO_FECHADO_ID);
    expect(cicloFechado?.sobraCents).not.toBe(999_999);
  });
});

describe('editarParcelamento — trocar categoriaId de parcela em ciclo fechado (achado CRÍTICO #1)', () => {
  it('exige confirmarRetroativo e recalcula sobraCents ao trocar de grupo VARIAVEL para FIXO', async () => {
    const deps = criarDepsFake({
      hoje: '2026-07-20',
      ciclos: [cicloAbertoFake(), cicloFechadoFake()],
    });

    // Parcela única, inteira dentro do ciclo fechado (fev/2026) — nenhuma
    // parcela em ciclo aberto, então a troca de grupo não fura o teto de
    // ciclo nenhum: é pura correção de cadastro histórico.
    const parcelas = await criarParcelamento(deps, {
      descricao: 'Fritadeira',
      valorTotalCents: 30_000, // R$300, igual ao caso provado pela auditoria
      numParcelas: 1,
      dataCompra: '2026-02-10',
      categoriaId: CATEGORIA_VARIAVEL.id,
    });
    const parcelamentoId = parcelas[0]!.parcelamentoId!;
    expect(parcelas[0]!.cicloId).toBe(CICLO_FECHADO_ID);

    const cicloAntes = await deps.ciclos.obter(CICLO_FECHADO_ID);
    expect(cicloAntes?.sobraCents).toBe(999_999); // desatualizado de propósito (fixture)

    // Sem confirmarRetroativo: recusado, nada muda (categoria e sobra intactas).
    await expect(
      editarParcelamento(deps, parcelamentoId, { categoriaId: CATEGORIA_FIXA.id }),
    ).rejects.toBeInstanceOf(CicloFechadoError);

    const inalterado = await deps.transacoes.listarPorParcelamento(parcelamentoId);
    expect(inalterado[0]!.categoriaId).toBe(CATEGORIA_VARIAVEL.id);
    const cicloInalterado = await deps.ciclos.obter(CICLO_FECHADO_ID);
    expect(cicloInalterado?.sobraCents).toBe(999_999);

    // Com confirmarRetroativo: aceito, e sobraCents é recalculada de verdade.
    const editado = await editarParcelamento(
      deps,
      parcelamentoId,
      { categoriaId: CATEGORIA_FIXA.id },
      true,
    );
    expect(editado.categoriaId).toBe(CATEGORIA_FIXA.id);

    const parcelaEditada = await deps.transacoes.obter(parcelas[0]!.id);
    expect(parcelaEditada?.categoriaId).toBe(CATEGORIA_FIXA.id);

    // Verba do ciclo fechado é 500_000. Com a parcela em VARIAVEL, o gasto
    // realizado era 30_000 -> sobra 470_000. Depois de virar FIXO, a parcela
    // some do gasto realizado (contaComoVerbaVariavel filtra por grupo
    // VARIAVEL) -> sobra volta a 500_000. Essa é a correção do achado
    // CRÍTICO #1: sem ela, sobraCents ficaria travado em 999_999 (ou em
    // 470_000, se só a guarda de retroatividade fosse aplicada sem trocar a
    // categoria de fato) — nunca em 500_000.
    const cicloDepois = await deps.ciclos.obter(CICLO_FECHADO_ID);
    expect(cicloDepois?.sobraCents).toBe(500_000);
  });
});

describe('editarParcelamento — categoria de grupo não-VARIAVEL em parcela de ciclo aberto (D-11 pela porta dos fundos)', () => {
  it('recusa trocar para categoria FIXO quando a parcela ainda está em ciclo aberto', async () => {
    const deps = criarDepsFake({ hoje: '2026-07-20', ciclos: [cicloAbertoFake()] });

    const parcelas = await criarParcelamento(deps, {
      descricao: 'Ar-condicionado',
      valorTotalCents: 300_00,
      numParcelas: 3,
      dataCompra: '2026-07-05',
      categoriaId: CATEGORIA_VARIAVEL.id,
    });
    const parcelamentoId = parcelas[0]!.parcelamentoId!;

    await expect(
      editarParcelamento(deps, parcelamentoId, { categoriaId: CATEGORIA_FIXA.id }),
    ).rejects.toBeInstanceOf(CategoriaInvalidaParaParcelaError);

    const inalterado = await deps.transacoes.listarPorParcelamento(parcelamentoId);
    expect(inalterado.every((t) => t.categoriaId === CATEGORIA_VARIAVEL.id)).toBe(true);
  });
});

describe('editarParcelamento — parcelamento encerrado (achado ALTO #2)', () => {
  it('recusa editar valorTotalCents/numParcelas/dataCompra de parcelamento já encerrado', async () => {
    const deps = criarDepsFake({ hoje: '2026-07-20', ciclos: [cicloAbertoFake()] });

    const parcelas = await criarParcelamento(deps, {
      descricao: 'Notebook',
      valorTotalCents: 300_00,
      numParcelas: 3,
      dataCompra: '2026-08-05', // todas estritamente futuras em relação a "hoje" (2026-07-20)
      categoriaId: CATEGORIA_VARIAVEL.id,
    });
    const parcelamentoId = parcelas[0]!.parcelamentoId!;

    // Nenhuma paga, nenhuma em ciclo fechado, todas futuras -> encerramento apaga as 3.
    const encerramento = await encerrarParcelamento(deps, parcelamentoId);
    expect(encerramento.parcelasCanceladas).toBe(3);
    const encerrado = await deps.parcelamentos.obter(parcelamentoId);
    expect(encerrado?.encerradoEm).toBe('2026-07-20');

    await expect(
      editarParcelamento(deps, parcelamentoId, { valorTotalCents: 600_00 }),
    ).rejects.toBeInstanceOf(ParcelamentoEncerradoError);

    // Nada foi ressuscitado.
    const depois = await deps.transacoes.listarPorParcelamento(parcelamentoId);
    expect(depois).toHaveLength(0);
    const parcelamentoDepois = await deps.parcelamentos.obter(parcelamentoId);
    expect(parcelamentoDepois?.encerradoEm).toBe('2026-07-20');
    expect(parcelamentoDepois?.valorTotalCents).toBe(300_00);
  });

  it('continua permitindo editar descricao/categoriaId de parcelamento encerrado (cadastro histórico)', async () => {
    const deps = criarDepsFake({
      hoje: '2026-07-20',
      ciclos: [cicloAbertoFake()],
      categorias: [CATEGORIA_VARIAVEL, CATEGORIA_FIXA],
    });

    const parcelas = await criarParcelamento(deps, {
      descricao: 'Notebook',
      valorTotalCents: 300_00,
      numParcelas: 3,
      dataCompra: '2026-07-05',
      categoriaId: CATEGORIA_VARIAVEL.id,
    });
    const parcelamentoId = parcelas[0]!.parcelamentoId!;
    await encerrarParcelamento(deps, parcelamentoId);

    const editado = await editarParcelamento(deps, parcelamentoId, { descricao: 'Notebook (cancelado)' });
    expect(editado.descricao).toBe('Notebook (cancelado)');
  });
});

describe('encerrarParcelamento — carimba encerradoEm só quando algo é cancelado (achado MÉDIO #3)', () => {
  it('não carimba encerradoEm quando nada é cancelado (parcelamento inteiro em ciclo fechado)', async () => {
    // Ciclo fechado largo o bastante para cobrir as 6 parcelas mensais
    // (fev-jul), incluindo "hoje" (2026-07-20) — mesmo padrão do teste R1
    // "cobre hoje" acima, para não depender também da regra "futura".
    const cicloFechadoLargo = cicloFake({
      id: 'ciclo-fechado-largo',
      dataInicio: '2026-01-01',
      dataFim: '2026-12-31',
      verbaVariavelCents: 500_000,
      fechado: true,
      fechadoEm: '2026-08-01',
      sobraCents: 999_999,
    });
    const deps = criarDepsFake({ hoje: '2026-07-20', ciclos: [cicloFechadoLargo] });

    const parcelas = await criarParcelamento(deps, {
      descricao: 'Máquina de lavar',
      valorTotalCents: 600_00,
      numParcelas: 6,
      dataCompra: '2026-02-05', // todas as 6 caem no ciclo fechado largo (fev-jul)
      categoriaId: CATEGORIA_VARIAVEL.id,
    });
    const parcelamentoId = parcelas[0]!.parcelamentoId!;
    expect(parcelas.every((p) => p.cicloId === 'ciclo-fechado-largo')).toBe(true);

    const resultado = await encerrarParcelamento(deps, parcelamentoId);

    expect(resultado.parcelasCanceladas).toBe(0);
    expect(resultado.parcelasPreservadas).toBe(6);

    const parcelamento = await deps.parcelamentos.obter(parcelamentoId);
    expect(parcelamento?.encerradoEm).toBeNull();

    const restantes = await deps.transacoes.listarPorParcelamento(parcelamentoId);
    expect(restantes).toHaveLength(6);
  });
});

describe('encerrarParcelamento — "futura" vs "não paga" (achado MÉDIO #4)', () => {
  it('preserva parcela paga em ciclo aberto', async () => {
    const deps = criarDepsFake({ hoje: '2026-07-20', ciclos: [cicloAbertoFake()] });

    const parcelas = await criarParcelamento(deps, {
      descricao: 'Fogão',
      valorTotalCents: 300_00,
      numParcelas: 3,
      dataCompra: '2026-07-05',
      categoriaId: CATEGORIA_VARIAVEL.id,
    });
    const parcelamentoId = parcelas[0]!.parcelamentoId!;
    // Primeira parcela (2026-07-05) paga, mesmo estando em ciclo ainda aberto.
    await deps.transacoes.marcarPaga(parcelas[0]!.id, parcelas[0]!.data);

    const resultado = await encerrarParcelamento(deps, parcelamentoId);

    expect(resultado.parcelasPreservadas).toBe(1);
    expect(resultado.parcelasCanceladas).toBe(2);
    const restante = await deps.transacoes.obter(parcelas[0]!.id);
    expect(restante).not.toBeNull();
    expect(restante?.pagoEm).toBe(parcelas[0]!.data);
  });

  it('preserva parcela vencida e não paga em ciclo aberto (provavelmente já caiu no cartão)', async () => {
    const deps = criarDepsFake({ hoje: '2026-07-20', ciclos: [cicloAbertoFake()] });

    const parcelas = await criarParcelamento(deps, {
      descricao: 'Fogão',
      valorTotalCents: 300_00,
      numParcelas: 3,
      dataCompra: '2026-07-05', // 1ª parcela é hoje: vencida, não paga, ciclo ainda aberto
      categoriaId: CATEGORIA_VARIAVEL.id,
    });
    const parcelamentoId = parcelas[0]!.parcelamentoId!;
    expect(parcelas[0]!.data).toBe('2026-07-05'); // <= hoje (2026-07-20): não é futura
    expect(parcelas[0]!.pagoEm).toBeNull();

    const resultado = await encerrarParcelamento(deps, parcelamentoId);

    // Só as parcelas estritamente futuras (ago e set) são canceladas; a de
    // julho (vencida, não paga) é preservada mesmo sem `pagoEm`.
    expect(resultado.parcelasCanceladas).toBe(2);
    expect(resultado.parcelasPreservadas).toBe(1);
    const restante = await deps.transacoes.obter(parcelas[0]!.id);
    expect(restante).not.toBeNull();
    expect(restante?.pagoEm).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TASKS-CUSTOS Fase 8 — a tela de gestão de compras parceladas
// ─────────────────────────────────────────────────────────────────────────────

describe('previaEncerramentoParcelamento — os números ANTES das opções (§4.2)', () => {
  /**
   * O teste que vale por todos os outros desta seção: se a prévia e a ação
   * pudessem divergir, o diálogo prometeria cancelar N e a ação cancelaria M.
   * A garantia estrutural é `particionarParcelas` ser o ponto único; este
   * teste prova que ela vale de ponta a ponta.
   */
  it('bate exatamente com o que encerrarParcelamento faz', async () => {
    const deps = criarDepsFake({
      hoje: '2026-07-20',
      ciclos: [cicloAbertoFake(), cicloFechadoFake()],
    });

    const parcelas = await criarParcelamento(deps, {
      descricao: 'Notebook',
      valorTotalCents: 1_200_00,
      numParcelas: 12,
      dataCompra: '2026-02-05', // 1ª parcela cai no ciclo FECHADO (fev)
      categoriaId: CATEGORIA_VARIAVEL.id,
    });
    const parcelamentoId = parcelas[0]!.parcelamentoId!;
    for (const p of parcelas.slice(1, 4)) await deps.transacoes.marcarPaga(p.id, p.data);

    const previa = await previaEncerramentoParcelamento(deps, parcelamentoId);
    const resultado = await encerrarParcelamento(deps, parcelamentoId);

    expect(resultado.parcelasCanceladas).toBe(previa.aCancelar.quantidade);
    expect(resultado.parcelasPreservadas).toBe(
      previa.pagas.quantidade + previa.preservadas.quantidade,
    );
    // E a soma prometida é a soma real do que sumiu.
    const restantes = await deps.transacoes.listarPorParcelamento(parcelamentoId);
    const somaRestante = restantes.reduce((s, t) => s + t.valorCents, 0);
    expect(somaRestante).toBe(1_200_00 - previa.aCancelar.valorCents);
  });

  it('conta pagas, a cancelar e preservadas em grupos separados, com meses', async () => {
    const deps = criarDepsFake({ hoje: '2026-07-20', ciclos: [cicloAbertoFake()] });

    const parcelas = await criarParcelamento(deps, {
      descricao: 'Passagem',
      valorTotalCents: 600_00,
      numParcelas: 6,
      dataCompra: '2026-04-05',
      categoriaId: CATEGORIA_VARIAVEL.id,
    });
    const parcelamentoId = parcelas[0]!.parcelamentoId!;
    // abr e mai pagas; jun e jul vencidas sem marcação; ago e set futuras.
    for (const p of parcelas.slice(0, 2)) await deps.transacoes.marcarPaga(p.id, p.data);

    const previa = await previaEncerramentoParcelamento(deps, parcelamentoId);

    expect(previa.pagas.quantidade).toBe(2);
    expect(previa.pagas.primeiraEm).toBe('2026-04-05');
    expect(previa.pagas.ultimaEm).toBe('2026-05-05');
    expect(previa.preservadas.quantidade).toBe(2); // jun e jul: vencidas, não marcadas
    expect(previa.aCancelar.quantidade).toBe(2); // ago e set
    expect(previa.aCancelar.primeiraEm).toBe('2026-08-05');
    expect(previa.aCancelar.valorCents).toBe(100_00 * 2);
    // O alívio é o valor da PRIMEIRA cancelada, a partir da competência dela.
    expect(previa.alivioMensalCents).toBe(100_00);
    expect(previa.alivioAPartirDe).toBe('2026-08-05');
    // Nenhum grupo se sobrepõe: 2 + 2 + 2 = as 6 parcelas.
    expect(
      previa.pagas.quantidade + previa.preservadas.quantidade + previa.aCancelar.quantidade,
    ).toBe(6);
  });

  it('parcela futura em ciclo FECHADO é preservada, não cancelada', async () => {
    // O ciclo fechado aqui cobre datas FUTURAS em relação a "hoje" — é o caso
    // em que "futura" e "protegida" se cruzam, e a proteção tem que vencer.
    const deps = criarDepsFake({
      hoje: '2026-07-20',
      ciclos: [
        cicloAbertoFake(),
        cicloFechadoFake({
          id: 'ciclo-fechado-futuro',
          dataInicio: '2026-08-05',
          dataFim: '2026-09-04',
        }),
      ],
    });

    const parcelas = await criarParcelamento(deps, {
      descricao: 'Cadeira',
      valorTotalCents: 300_00,
      numParcelas: 3,
      dataCompra: '2026-07-05',
      categoriaId: CATEGORIA_VARIAVEL.id,
    });
    const parcelamentoId = parcelas[0]!.parcelamentoId!;
    expect(parcelas[1]!.cicloId).toBe('ciclo-fechado-futuro'); // ago, futura E congelada

    const previa = await previaEncerramentoParcelamento(deps, parcelamentoId);
    expect(previa.aCancelar.quantidade).toBe(1); // só setembro
    expect(previa.preservadas.quantidade).toBe(2); // julho (vencida) + agosto (ciclo fechado)

    await encerrarParcelamento(deps, parcelamentoId);
    const restantes = await deps.transacoes.listarPorParcelamento(parcelamentoId);
    expect(restantes.map((t) => t.data)).toEqual(['2026-07-05', '2026-08-05']);
  });

  it('parcelamento já encerrado não promete cancelar nada', async () => {
    const deps = criarDepsFake({ hoje: '2026-07-20', ciclos: [cicloAbertoFake()] });
    const parcelas = await criarParcelamento(deps, {
      descricao: 'Fone',
      valorTotalCents: 300_00,
      numParcelas: 3,
      dataCompra: '2026-07-05',
      categoriaId: CATEGORIA_VARIAVEL.id,
    });
    const parcelamentoId = parcelas[0]!.parcelamentoId!;
    await encerrarParcelamento(deps, parcelamentoId);

    const previa = await previaEncerramentoParcelamento(deps, parcelamentoId);
    expect(previa.jaEncerrado).toBe(true);
    expect(previa.aCancelar.quantidade).toBe(0);
    expect(previa.alivioMensalCents).toBeNull();
  });
});

describe('encerrarParcelamento — atomicidade (§5.1 ticket 1)', () => {
  /**
   * Antes eram três round-trips POR PARCELA. Uma falha no meio deixava saldo
   * creditado de parcela que continuava viva; o retry creditava DE NOVO — e a
   * conta terminava com dinheiro que nunca existiu. Este teste falha na
   * versão antiga e passa na nova.
   */
  it('falha no meio não credita saldo de parcela que continua viva, e o retry não credita em dobro', async () => {
    const conta = contaFake({ id: 'conta-cartao', saldoCents: 0 });
    const deps = criarDepsFake({
      hoje: '2026-07-20',
      ciclos: [cicloAbertoFake()],
      contas: [conta],
    });

    // Três parcelas futuras, todas ligadas à conta (cada DESPESA já debitou).
    const parcelas = await criarParcelamento(deps, {
      descricao: 'TV',
      valorTotalCents: 300_00,
      numParcelas: 3,
      dataCompra: '2026-08-05',
      categoriaId: CATEGORIA_VARIAVEL.id,
    });
    const parcelamentoId = parcelas[0]!.parcelamentoId!;
    for (const p of parcelas) {
      await deps.transacoes.atualizar(p.id, { contaId: conta.id });
      await deps.contas.ajustarSaldo(conta.id, -p.valorCents);
    }
    expect(deps.contas.saldoDe(conta.id)).toBe(-300_00);

    // Primeira tentativa: o banco aborta no meio.
    deps.transacoes.falharNoLote = 'conexão perdida';
    await expect(encerrarParcelamento(deps, parcelamentoId)).rejects.toThrow('conexão perdida');

    // Nada mudou: nem saldo creditado, nem parcela apagada, nem `encerradoEm`.
    expect(deps.contas.saldoDe(conta.id)).toBe(-300_00);
    expect(await deps.transacoes.listarPorParcelamento(parcelamentoId)).toHaveLength(3);
    expect((await deps.parcelamentos.obter(parcelamentoId))?.encerradoEm).toBeNull();

    // Retry: credita UMA vez só.
    deps.transacoes.falharNoLote = null;
    const resultado = await encerrarParcelamento(deps, parcelamentoId);

    expect(resultado.parcelasCanceladas).toBe(3);
    expect(deps.contas.saldoDe(conta.id)).toBe(0);
    expect(await deps.transacoes.listarPorParcelamento(parcelamentoId)).toHaveLength(0);
  });
});

describe('listarParcelamentos — o read-model da tela (§3.2)', () => {
  it('deriva valorMensalCents e a parcela corrente das Transacao reais', async () => {
    const deps = criarDepsFake({ hoje: '2026-07-20', ciclos: [cicloAbertoFake()] });

    // 1.000,01 em 3 parcelas: floor com resto na última (333,33 / 333,33 / 333,35).
    const parcelas = await criarParcelamento(deps, {
      descricao: 'Bicicleta',
      valorTotalCents: 100_001,
      numParcelas: 3,
      dataCompra: '2026-06-05',
      categoriaId: CATEGORIA_VARIAVEL.id,
    });
    const parcelamentoId = parcelas[0]!.parcelamentoId!;

    const [resumo] = await listarParcelamentos(deps);
    expect(resumo?.id).toBe(parcelamentoId);
    // Ciclo atual vai até 2026-08-04, então jun e jul já caíram: corrente = 2.
    expect(resumo?.parcelaCorrente).toBe(2);
    // E o valor/mês é o da parcela corrente REAL — não `total / n`, que daria
    // 333,33 e mentiria sobre a última, nem uma média que não existe.
    expect(resumo?.valorMensalCents).toBe(parcelas[1]!.valorCents);
    expect(resumo?.terminaEm).toBe('2026-08-05');
    expect(resumo?.parcelas).toHaveLength(3);
    expect(resumo?.parcelas.map((p) => p.transacaoId)).toEqual(parcelas.map((p) => p.id));
    // A soma das parcelas continua sendo o total, com o resto na última.
    expect(resumo?.parcelas.reduce((s, p) => s + p.valorCents, 0)).toBe(100_001);
  });

  it('marca "acaba no próximo ciclo" e só ele', async () => {
    const deps = criarDepsFake({ hoje: '2026-07-20', ciclos: [cicloAbertoFake()] });

    // Ciclo atual: 2026-07-05 → 2026-08-04. Próximo: 2026-08-05 → 2026-09-04.
    const acaba = await criarParcelamento(deps, {
      descricao: 'Acaba em agosto',
      valorTotalCents: 200_00,
      numParcelas: 2,
      dataCompra: '2026-07-05', // 2ª (e última) parcela em 2026-08-05
      categoriaId: CATEGORIA_VARIAVEL.id,
    });
    const longa = await criarParcelamento(deps, {
      descricao: 'Vai longe',
      valorTotalCents: 1_200_00,
      numParcelas: 12,
      dataCompra: '2026-07-05',
      categoriaId: CATEGORIA_VARIAVEL.id,
    });

    const resumos = await listarParcelamentos(deps);
    const porId = new Map(resumos.map((r) => [r.id, r]));

    expect(porId.get(acaba[0]!.parcelamentoId!)?.acabaNoProximoCiclo).toBe(true);
    expect(porId.get(longa[0]!.parcelamentoId!)?.acabaNoProximoCiclo).toBe(false);
  });

  it('terminaEm vem do MAIOR data, não da ordem em que o repositório devolveu', async () => {
    // Blindagem do ticket 5: se um adapter novo devolvesse fora de ordem,
    // `at(-1)` daria a competência errada em silêncio.
    const deps = criarDepsFake({ hoje: '2026-07-20', ciclos: [cicloAbertoFake()] });
    const parcelas = await criarParcelamento(deps, {
      descricao: 'Mesa',
      valorTotalCents: 300_00,
      numParcelas: 3,
      dataCompra: '2026-07-05',
      categoriaId: CATEGORIA_VARIAVEL.id,
    });
    // Embaralha a ordem física do array do fake.
    deps.transacoes.itens.reverse();

    const [resumo] = await listarParcelamentos(deps);
    expect(resumo?.terminaEm).toBe('2026-09-05');
    expect(parcelas.map((p) => p.data)).toContain('2026-09-05');
  });
});

describe('criarParcelamento — categoria precisa ser VARIAVEL (§5.1 ticket 6)', () => {
  it('recusa categoria de grupo FIXO sem deixar cadastro órfão', async () => {
    const deps = criarDepsFake({ hoje: '2026-07-20', ciclos: [cicloAbertoFake()] });

    await expect(
      criarParcelamento(deps, {
        descricao: 'Sofá',
        valorTotalCents: 300_00,
        numParcelas: 3,
        dataCompra: '2026-07-05',
        categoriaId: CATEGORIA_FIXA.id,
      }),
    ).rejects.toBeInstanceOf(CategoriaInvalidaParaParcelaError);

    // A validação vem ANTES de qualquer escrita: nem parcelamento, nem parcela.
    expect(deps.parcelamentos.itens).toHaveLength(0);
    expect(deps.transacoes.itens).toHaveLength(0);
  });
});

describe('editarParcelamento — vínculos da parcela sobrevivem à regeneração (§5.1 ticket 2)', () => {
  it('preserva contaId e provisaoId ao mudar o valor total', async () => {
    const conta = contaFake({ id: 'conta-cartao', saldoCents: 0 });
    const provisao = provisaoFake({ id: 'prov-ipva', acumuladoCents: 500_00 });
    const deps = criarDepsFake({
      hoje: '2026-07-20',
      ciclos: [cicloAbertoFake()],
      contas: [conta],
      provisoes: [provisao],
    });

    const parcelas = await criarParcelamento(deps, {
      descricao: 'Pneus',
      valorTotalCents: 300_00,
      numParcelas: 3,
      dataCompra: '2026-08-05',
      categoriaId: CATEGORIA_VARIAVEL.id,
    });
    const parcelamentoId = parcelas[0]!.parcelamentoId!;
    for (const p of parcelas) {
      await deps.transacoes.atualizar(p.id, { contaId: conta.id, provisaoId: provisao.id });
    }

    await editarParcelamento(deps, parcelamentoId, { valorTotalCents: 600_00 });

    const novas = await deps.transacoes.listarPorParcelamento(parcelamentoId);
    expect(novas).toHaveLength(3);
    for (const t of novas) {
      expect(t.contaId).toBe(conta.id);
      expect(t.provisaoId).toBe(provisao.id);
    }
    // E o invariante de sempre: a soma continua batendo com o total.
    expect(novas.reduce((s, t) => s + t.valorCents, 0)).toBe(600_00);
  });

  it('metodo se propaga para as parcelas sem exigir confirmação retroativa', async () => {
    const deps = criarDepsFake({
      hoje: '2026-07-20',
      ciclos: [cicloAbertoFake(), cicloFechadoFake()],
    });
    const parcelas = await criarParcelamento(deps, {
      descricao: 'Curso',
      valorTotalCents: 800_00,
      numParcelas: 8,
      dataCompra: '2026-02-05', // 1ª no ciclo FECHADO
      categoriaId: CATEGORIA_VARIAVEL.id,
      metodo: 'CREDITO',
    });
    const parcelamentoId = parcelas[0]!.parcelamentoId!;

    // Sem `confirmarRetroativo`: `metodo` não entra em nenhuma fórmula de
    // dinheiro, então exigir confirmação aqui treinaria o dono a ignorá-la.
    await editarParcelamento(deps, parcelamentoId, { metodo: 'PIX' });

    const todas = await deps.transacoes.listarPorParcelamento(parcelamentoId);
    expect(todas.every((t) => t.metodo === 'PIX')).toBe(true);
  });
});
