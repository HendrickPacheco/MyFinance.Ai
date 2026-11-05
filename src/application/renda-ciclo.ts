/**
 * Renda do ciclo (D7, D8): recalcular a renda PREVISTA a partir da Config +
 * cotação, e confirmar a renda REAL. As duas são ações explícitas do dono, com
 * prévia; o ciclo guarda prevista e real lado a lado.
 */
import type { Deps } from './deps';
import { exigirEscrita } from '@/domain/auth/permissoes';
import type { Ciclo, Config } from '@/domain/model/entidades';
import {
  aplicarNovaRendaAoCiclo,
  diasTotaisCiclo,
  dividirVerba,
  somaParcelasCents,
  projetarDiaADiaDiarioCents,
  rendaEfetivaCents,
  rendaLiquidaPrevista,
  type RendaLiquida,
} from '@/domain/finance';
import type { DataCivil } from '@/shared/data';
import { ConfigAusenteError, garantirCicloAtual } from './ciclos';
import { obterCotacaoUsd } from './cotacao';
import { CicloFechadoError } from './retroatividade';
import { criarTransacao } from './transacoes';

export class RendaJaConfirmadaError extends Error {
  constructor() {
    super('A renda real deste ciclo já foi confirmada; a prevista não é mais recalculada.');
    this.name = 'RendaJaConfirmadaError';
  }
}

export interface ImpactoRenda {
  rendaAntesCents: number;
  rendaDepoisCents: number;
  verbaAntesCents: number;
  verbaDepoisCents: number;
  diaADiaDiarioAntesCents: number;
  diaADiaDiarioDepoisCents: number;
  extrasAntesCents: number;
  extrasDepoisCents: number;
  decomposicao: string;
  aviso: string | null;
}

export interface RendaRealInput {
  brutaOrigemCents?: number;
  taxaMicros?: number;
  impostoCents?: number;
  liquidaCents?: number;
  gerarLancamento: boolean;
}

export interface PreviaConfirmacaoRenda extends ImpactoRenda {
  lancamento: { valorCents: number; data: DataCivil; descricao: string } | null;
}

async function obterConfig(deps: Deps): Promise<Config> {
  const config = await deps.config.obter();
  if (!config) throw new ConfigAusenteError();
  return config;
}

/** Antes/depois de trocar a renda do ciclo — só leitura, nada é gravado. */
function impacto(
  ciclo: Ciclo,
  config: Config,
  renda: RendaLiquida,
  aviso: string | null,
  parcelasCents: number,
) {
  const nova = aplicarNovaRendaAoCiclo(ciclo, renda.liquidaCents, config.metaPoupancaPercent);
  const diasCiclo = diasTotaisCiclo({ inicio: ciclo.dataInicio, fim: ciclo.dataFim });
  const verbas = (v: { verbaVariavelCents: number; poupancaAlvoCents: number }) => {
    const divisao = dividirVerba({ ...v, parcelasCents, pisoDiarioCents: config.pisoDiarioVerbaCents, diasCiclo });
    return {
      diario: projetarDiaADiaDiarioCents(divisao, diasCiclo),
      extras: divisao.extrasCents,
    };
  };
  const antes = verbas(ciclo);
  const depois = verbas(nova);
  const impactoRenda: ImpactoRenda = {
    rendaAntesCents: rendaEfetivaCents(ciclo),
    rendaDepoisCents: renda.liquidaCents,
    verbaAntesCents: ciclo.verbaVariavelCents,
    verbaDepoisCents: nova.verbaVariavelCents,
    diaADiaDiarioAntesCents: antes.diario,
    diaADiaDiarioDepoisCents: depois.diario,
    extrasAntesCents: antes.extras,
    extrasDepoisCents: depois.extras,
    decomposicao: renda.decomposicao,
    aviso,
  };
  return { impactoRenda, nova };
}

// ---------------------------------------------------------------- prevista

async function planejarRecalculo(deps: Deps) {
  const config = await obterConfig(deps);
  const { ciclo } = await garantirCicloAtual(deps);
  if (ciclo.fechado) throw new CicloFechadoError([ciclo.id]);
  if (ciclo.rendaRealLiquidaCents != null) throw new RendaJaConfirmadaError();

  const { cotacao, aviso } =
    config.moedaRenda === 'USD' ? await obterCotacaoUsd(deps) : { cotacao: null, aviso: null };
  const renda = rendaLiquidaPrevista(config, cotacao);
  const parcelas = somaParcelasCents(await deps.transacoes.listarPorCiclo(ciclo.id));
  return { ciclo, renda, ...impacto(ciclo, config, renda, aviso ?? renda.motivoSemCotacao, parcelas) };
}

export async function previaRecalculoRenda(deps: Deps): Promise<ImpactoRenda> {
  return (await planejarRecalculo(deps)).impactoRenda;
}

export async function recalcularRendaDoCiclo(deps: Deps): Promise<Ciclo> {
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  exigirEscrita(deps.ator);

  const { ciclo, renda, nova } = await planejarRecalculo(deps);
  return deps.ciclos.atualizar(ciclo.id, {
    rendaPrevistaCents: renda.liquidaCents,
    ...nova,
    cotacaoPrevistaMicros: renda.taxaMicros,
    cotacaoPrevistaData: renda.dataCotacao,
  });
}

// ---------------------------------------------------------------- real

const inteiroNaoNegativo = (v: number | undefined): v is number =>
  v != null && Number.isInteger(v) && v >= 0;

/**
 * A renda real passa pela MESMA função da prevista (`rendaLiquidaPrevista`),
 * com uma Config sintética: assim a conta e a decomposição em texto não têm
 * uma segunda implementação para divergir.
 */
function rendaReal(config: Config, input: RendaRealInput, hoje: DataCivil): RendaLiquida {
  const semImposto = { impostoEstimadoPercentual: null, rendaBrutaMoedaOrigemCents: null };
  if (config.moedaRenda === 'BRL') {
    if (!inteiroNaoNegativo(input.liquidaCents)) {
      throw new RangeError('Informe a renda líquida recebida em centavos.');
    }
    return rendaLiquidaPrevista(
      { ...semImposto, moedaRenda: 'BRL', rendaBaseCents: input.liquidaCents, impostoEstimadoCents: null },
      null,
    );
  }
  const { brutaOrigemCents, taxaMicros, impostoCents } = input;
  if (
    !inteiroNaoNegativo(brutaOrigemCents) ||
    !inteiroNaoNegativo(impostoCents) ||
    !inteiroNaoNegativo(taxaMicros) ||
    taxaMicros === 0
  ) {
    throw new RangeError('Informe a renda bruta em dólar, a cotação usada e o imposto pago.');
  }
  const renda = rendaLiquidaPrevista(
    {
      ...semImposto,
      moedaRenda: 'USD',
      rendaBaseCents: 0,
      rendaBrutaMoedaOrigemCents: brutaOrigemCents,
      impostoEstimadoCents: impostoCents,
    },
    { data: hoje, taxaMicros },
  );
  if (renda.liquidaCents < 0) throw new RangeError('O imposto é maior que a renda bruta.');
  return renda;
}

async function planejarConfirmacao(deps: Deps, cicloId: string, input: RendaRealInput) {
  const config = await obterConfig(deps);
  const ciclo = await deps.ciclos.obter(cicloId);
  if (!ciclo) throw new Error('Ciclo não encontrado.');
  if (ciclo.fechado) throw new CicloFechadoError([ciclo.id]);

  const hoje = deps.relogio.hoje();
  const renda = rendaReal(config, input, hoje);
  const { impactoRenda, nova } = impacto(
    ciclo,
    config,
    renda,
    null,
    somaParcelasCents(await deps.transacoes.listarPorCiclo(ciclo.id)),
  );
  // Re-confirmação corrige os números, mas não gera um segundo lançamento.
  const lancamento =
    input.gerarLancamento && ciclo.rendaRealLiquidaCents == null
      ? {
          valorCents: renda.liquidaCents,
          data: hoje < ciclo.dataFim ? hoje : ciclo.dataFim,
          descricao: 'Renda do ciclo',
        }
      : null;
  return { ciclo, renda, nova, previa: { ...impactoRenda, lancamento } };
}

export async function previaConfirmacaoRendaReal(
  deps: Deps,
  cicloId: string,
  input: RendaRealInput,
): Promise<PreviaConfirmacaoRenda> {
  return (await planejarConfirmacao(deps, cicloId, input)).previa;
}

export async function confirmarRendaReal(
  deps: Deps,
  cicloId: string,
  input: RendaRealInput,
): Promise<Ciclo> {
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  exigirEscrita(deps.ator);

  const { ciclo, renda, nova, previa } = await planejarConfirmacao(deps, cicloId, input);
  const atualizado = await deps.ciclos.atualizar(ciclo.id, {
    rendaRealBrutaMoedaOrigemCents: renda.brutaOrigemCents,
    cotacaoRealUsadaMicros: renda.taxaMicros,
    impostoRealCents: renda.moeda === 'USD' ? renda.impostoCents : null,
    rendaRealLiquidaCents: renda.liquidaCents,
    ...nova,
  });

  if (previa.lancamento) {
    const categorias = await deps.categorias.listar();
    await criarTransacao(deps, {
      ...previa.lancamento,
      tipo: 'RENDA',
      categoriaId: categorias.find((c) => c.grupo === 'RENDA')?.id ?? null,
      contaId: null,
    });
  }
  return atualizado;
}
