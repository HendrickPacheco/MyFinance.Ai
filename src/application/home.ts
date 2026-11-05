/**
 * Read-model da home (`/`, visual do protótipo). Compõe `obterEstadoPainel`
 * (não repete sua lógica), a projeção, a Config e o usuário da sessão. Nenhum
 * cálculo novo mora aqui — as contas são do motor (`@/domain/finance`).
 *
 * Mesmo contrato de resiliência do painel: só a base do ciclo pode lançar;
 * projeção, patrimônio, Config e usuário degradam para vazio.
 */
import {
  dataVencimentoNoCiclo,
  mesesCobertosPelaReserva,
  percentualDeAlvo,
  poupancaEstimadaDoCicloCents,
  proximosVencimentos,
  resumoPagamentosCents,
  statusDiaADia,
  type CompromissoComData,
} from '@/domain/finance';
import { addDias, MESES_ABREVIADOS_PT_BR, type DataCivil } from '@/shared/data';
import type { Deps } from './deps';
import { obterEstadoPainel } from './dashboard';
import type { LinhaParcelada } from './dashboard-tipos';
import type { EstadoHome, GrupoDespesa, LinhaDespesa } from './home-tipos';
import { obterPatrimonio } from './patrimonio';
import { obterProjecao } from './projecao';

const MESES_PT_BR = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
] as const;

const META_MESES_RESERVA = 6;

const VERBA_LIVRE_VAZIA: EstadoHome['verbaLivre'] = {
  pontos: [],
  ultimoCents: 0,
  ultimoMes: '',
  faixaParcelasTerminando: null,
};

/** Percentual inteiro 0–100. */
const pct = (parte: number, total: number) => Math.round(percentualDeAlvo(parte, total));

const mesCurto = (data: DataCivil) => MESES_ABREVIADOS_PT_BR[Number(data.slice(5, 7)) - 1] ?? '';

export async function obterEstadoHome(deps: Deps): Promise<EstadoHome> {
  const painel = await obterEstadoPainel(deps);
  const { kpis, ciclo, hoje } = painel;

  const { verbas, metas } = painel;

  const [iniciais, reserva, verbaLivre] = await Promise.all([
    lerIniciais(deps),
    montarReserva(deps, {
      fixosCents: ciclo.fixosCents,
      parcelasCents: painel.parceladosTotalCents,
      diaADiaMensalCents: verbas.diaADiaCents,
    }),
    montarVerbaLivre(deps),
  ]);

  const fixos = painel.custosFixos.map((c) => ({
    id: c.custoFixoId,
    nome: c.nome,
    valorCents: c.valorCents,
    pago: c.pago,
    rotulo: null,
  }));
  const parcelas = painel.parcelados.map((p) => ({
    id: p.transacaoId,
    nome: p.descricao,
    valorCents: p.valorParcelaCents,
    pago: p.pago,
    rotulo: rotuloParcela(p),
  }));
  const grupoFixo = resumirGrupo(fixos);
  const grupoParcelado = resumirGrupo(parcelas);
  const { faltaPagarCents, jaPagueiCents } = resumoPagamentosCents(fixos, parcelas);
  const totalDespesasCents = grupoFixo.totalCents + grupoParcelado.totalCents;
  const fixoPercent = pct(grupoFixo.totalCents, totalDespesasCents);

  const poupancaEstimada = poupancaEstimadaDoCicloCents({
    verbaLivreCents: verbas.verbaLivreCents,
    gastoVariavelSemParcelasCents: painel.transacoesVariaveisTotalCents,
    diaADiaRestanteCents: verbas.diaADiaRestanteCents,
    extrasRestanteCents: verbas.extrasRestanteCents,
  });

  const ultimas = painel.parcelados.filter((p) => p.parcelaAtual === p.numParcelas);

  const proximos = proximosVencimentos({
    hoje,
    dias: 7,
    fixos: painel.custosFixos.flatMap((c): CompromissoComData[] => {
      try {
        const data = dataVencimentoNoCiclo(ciclo.dataInicio, ciclo.dataFim, c.diaVencimento);
        return [{ id: c.custoFixoId, nome: c.nome, data, valorCents: c.valorCents, pago: c.pago }];
      } catch {
        return []; // vencimento malformado: omite a linha, não derruba a home
      }
    }),
    parcelas: painel.parcelados.map((p) => ({
      id: p.transacaoId,
      nome: p.descricao,
      data: p.data,
      valorCents: p.valorParcelaCents,
      pago: p.pago,
      parcelaAtual: p.parcelaAtual,
      numParcelas: p.numParcelas,
    })),
  });

  return {
    categoriasLancamento: painel.categoriasLancamento,
    cabecalho: {
      mesNome: MESES_PT_BR[Number(hoje.slice(5, 7)) - 1] ?? '',
      diaDoCiclo: kpis.diasTotais - kpis.diasRestantes + 1,
      diasTotais: kpis.diasTotais,
      iniciais,
    },
    hero: {
      possoGastarHojeCents: kpis.podeGastarHojeCents,
      usadoDiaADiaCents: Math.min(verbas.diaADiaUsadoCents, verbas.diaADiaCents),
      diaADiaCents: verbas.diaADiaCents,
      diasRestantes: kpis.diasRestantes,
      progressoPercent: pct(
        Math.min(verbas.diaADiaUsadoCents, verbas.diaADiaCents),
        verbas.diaADiaCents,
      ),
      status: statusDiaADia({
        diaADiaCents: verbas.diaADiaCents,
        diaADiaUsadoCents: verbas.diaADiaUsadoCents,
        extrasRestanteCents: verbas.extrasRestanteCents,
        gastavelCents: verbas.gastavelCents,
        diasTotais: kpis.diasTotais,
        diasRestantes: kpis.diasRestantes,
      }),
      emRecuperacao: kpis.emRecuperacao,
    },
    extras: {
      disponivelCents: verbas.extrasRestanteCents,
      totalCents: verbas.extrasCents,
      progressoPercent: pct(verbas.extrasRestanteCents, verbas.extrasCents),
    },
    metaPoupanca: {
      guardadoCents: poupancaEstimada,
      alvoCents: metas.poupancaAlvoCents,
      progressoPercent: Math.min(100, pct(poupancaEstimada, metas.poupancaAlvoCents)),
      motivoSemGuardado: null,
    },
    reserva,
    despesas: {
      totalCents: totalDespesasCents,
      pagoCents: jaPagueiCents,
      aPagarCents: faltaPagarCents,
      fixoPercent,
      parceladoPercent: totalDespesasCents > 0 ? 100 - fixoPercent : 0,
      fixo: grupoFixo,
      parcelado: {
        ...grupoParcelado,
        terminamEsteMes:
          ultimas.length === 0
            ? null
            : {
                qtd: ultimas.length,
                valorCents: ultimas.reduce((s, p) => s + p.valorParcelaCents, 0),
                mesSeguinte: mesCurto(addDias(ciclo.dataFim, 1)),
              },
      },
    },
    proximos7Dias: { itens: proximos, total: proximos.length },
    verbaLivre,
  };
}

function rotuloParcela(p: LinhaParcelada): string {
  const base = `${p.parcelaAtual}/${p.numParcelas}`;
  return p.parcelaAtual === p.numParcelas ? `${base} · última` : base;
}

function resumirGrupo(linhas: readonly LinhaDespesa[]): GrupoDespesa {
  const { jaPagueiCents, faltaPagarCents } = resumoPagamentosCents(linhas, []);
  const totalCents = jaPagueiCents + faltaPagarCents;
  return {
    totalCents,
    pagoCents: jaPagueiCents,
    qtd: linhas.length,
    qtdPagas: linhas.filter((l) => l.pago).length,
    pagoPercent: pct(jaPagueiCents, totalCents),
    maiores: [...linhas].sort((a, b) => b.valorCents - a.valorCents).slice(0, 4),
    restantes: Math.max(0, linhas.length - 4),
  };
}

/** Iniciais do nome (primeira e última palavra) ou a 1ª letra do email; '?' sem dado. */
async function lerIniciais(deps: Deps): Promise<string> {
  try {
    const usuario = await deps.usuarios.porId(deps.ator.id);
    const palavras = (usuario?.nome ?? '').trim().split(/\s+/).filter(Boolean);
    const letras =
      palavras.length > 0
        ? (palavras[0]?.[0] ?? '') + (palavras.length > 1 ? (palavras.at(-1)?.[0] ?? '') : '')
        : (usuario?.email[0] ?? '');
    return letras.toUpperCase() || '?';
  } catch (erro) {
    console.error('[home] falha ao ler o usuário:', erro);
    return '?';
  }
}

// ponytail: relê o patrimônio (o painel já leu) só para ter saldo de reserva +
// motivo; expor os dois em `ResumoPatrimonioPainel` se o custo importar.
async function montarReserva(
  deps: Deps,
  gasto: { fixosCents: number; parcelasCents: number; diaADiaMensalCents: number },
): Promise<EstadoHome['reserva']> {
  try {
    const { saldoReservaCents } = await obterPatrimonio(deps);
    const meses = mesesCobertosPelaReserva({ saldoReservaCents, ...gasto });
    return {
      totalCents: saldoReservaCents,
      meses,
      metaMeses: META_MESES_RESERVA,
      progressoPercent: meses === null ? 0 : Math.min(100, pct(meses, META_MESES_RESERVA)),
      motivoSemDado: meses === null ? 'Sem gasto mensal no ciclo para medir a cobertura.' : null,
    };
  } catch (erro) {
    console.error('[home] falha ao montar a reserva:', erro);
    return {
      totalCents: 0,
      meses: null,
      metaMeses: META_MESES_RESERVA,
      progressoPercent: 0,
      motivoSemDado: 'Não foi possível ler o patrimônio agora.',
    };
  }
}

async function montarVerbaLivre(deps: Deps): Promise<EstadoHome['verbaLivre']> {
  try {
    const { ciclos } = await obterProjecao(deps, { numCiclos: 8 });
    const ultimo = ciclos.at(-1);
    if (!ultimo) return VERBA_LIVRE_VAZIA;

    const comFim = ciclos.flatMap((c, i) => (c.terminamNesteCiclo.length > 0 ? [i] : []));
    const inicioIdx = comFim[0];
    const fimIdx = comFim.at(-1);

    return {
      pontos: ciclos.map((c, i) => ({
        rotulo: `${mesCurto(c.inicio)}/${c.inicio.slice(2, 4)}`,
        verbaLivreCents: c.verbaLivreCents,
      })),
      ultimoCents: ultimo.verbaLivreCents,
      ultimoMes: mesCurto(ultimo.inicio),
      faixaParcelasTerminando:
        inicioIdx === undefined || fimIdx === undefined ? null : { inicioIdx, fimIdx },
    };
  } catch (erro) {
    console.error('[home] falha ao montar a projeção da verba livre:', erro);
    return VERBA_LIVRE_VAZIA;
  }
}
