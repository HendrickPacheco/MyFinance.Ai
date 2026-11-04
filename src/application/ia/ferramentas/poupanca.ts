/**
 * Ferramentas `poupanca_real` e `renda_do_ciclo` (Task 18).
 *
 * Cascas finas sobre read-models já testados — zero aritmética aqui:
 *  - guardado em curso: `estimarGuardadoDoCiclo` (o mesmo número do painel);
 *  - ciclos fechados e médias 3/6/12: `obterHistorico` (`montarHistorico`);
 *  - renda: `montarRenda` (o mesmo cartão das telas, com a decomposição em texto).
 *
 * Só leitura (regra 7b): usam `lerCicloAtual`, que nunca abre ciclo (D-8).
 * Todo `null` sai com o motivo em texto (D-14). A meta é OBJETIVO (D-16):
 * nada aqui a chama de reservada nem a desconta de coisa nenhuma.
 */
import type { Deps } from '@/application/deps';
import { lerCicloAtual } from '@/application/ciclos';
import { estimarGuardadoDoCiclo, montarRenda } from '@/application/dashboard';
import { obterHistorico } from '@/application/historico';
import { compararComMeta } from '@/domain/finance';
import { formatTaxaBRL, formatUSD } from '@/shared/dinheiro';
import { dinheiro, dinheiros, semCicloAberto, type SaidaFerramenta } from './saida';

const ORIGEM_POUPANCA = 'domain/finance/poupanca-real.ts: estimarPoupancaEmCurso, mediaPoupancaReal';
const ORIGEM_RENDA = 'application/dashboard.ts: montarRenda → domain/finance/renda.ts: rendaLiquidaPrevista';

const ULTIMOS_FECHADOS = 12;

const COMO_FOI_ESTIMADO = {
  SNAPSHOT: 'snapshot de patrimônio mais recente do ciclo menos o patrimônio do início do ciclo',
  SALDO_CONTAS:
    'sem snapshot no ciclo: efeito líquido das transações do ciclo nas contas que entram no patrimônio (razão contra razão; o snapshot inicial não entra, para não misturar razão com realidade)',
} as const;

/** `{ <nome>Cents, <nome>Formatado }` ou `{ <nome>: null, motivo }` (D-14). */
function dinheiroOuMotivo(nome: string, cents: number | null, motivo: string): SaidaFerramenta {
  return cents === null ? { [nome]: null, motivo } : dinheiro(nome, cents);
}

export async function poupancaRealFerramenta(deps: Deps): Promise<SaidaFerramenta> {
  const [resolvido, historico] = await Promise.all([lerCicloAtual(deps), obterHistorico(deps)]);

  let cicloAtual: SaidaFerramenta;
  if (!resolvido) {
    cicloAtual = { guardadoEstimado: null, motivo: 'Não há ciclo aberto no momento.' };
  } else {
    const { ciclo } = resolvido;
    const estimativa = await estimarGuardadoDoCiclo(deps, ciclo, deps.relogio.hoje());
    cicloAtual = {
      inicio: ciclo.dataInicio,
      fim: ciclo.dataFim,
      ...dinheiro('meta', ciclo.poupancaAlvoCents),
      ...(estimativa.realCents === null
        ? { guardadoEstimado: null, motivo: estimativa.motivo }
        : {
            estimado: true,
            fonte: estimativa.fonte,
            comoFoiEstimado: COMO_FOI_ESTIMADO[estimativa.fonte],
            ...dinheiros({
              guardadoEstimado: estimativa.realCents,
              diferencaParaMeta: compararComMeta(estimativa.realCents, ciclo.poupancaAlvoCents).diferencaCents,
            }),
          }),
    };
  }

  return {
    observacao:
      'Poupança real = variação do patrimônio no ciclo. A meta é OBJETIVO, não dinheiro reservado: ' +
      'ela nunca foi separada da verba. Compare guardado com meta; não diga que a meta está guardada.',
    cicloAtual,
    ultimosFechados: historico.meses.slice(0, ULTIMOS_FECHADOS).map((m) => ({
      inicio: m.dataInicio,
      fim: m.dataFim,
      ...dinheiro('meta', m.poupancaAlvoCents),
      ...dinheiroOuMotivo('real', m.poupancaRealCents, m.motivoSemPoupancaReal ?? ''),
      ...(m.diferencaMetaCents === null ? { diferenca: null } : dinheiro('diferenca', m.diferencaMetaCents)),
    })),
    medias: historico.mediasPoupancaReal.map((m) => ({
      ciclos: m.ciclos,
      ciclosConsiderados: m.ciclosConsiderados,
      ...dinheiroOuMotivo(
        'media',
        m.mediaCents,
        `Nenhum dos últimos ${m.ciclos} ciclos fechados tem poupança real medida.`,
      ),
    })),
    comoFoiCalculado: ORIGEM_POUPANCA,
  };
}

function motivoSemCotacao(moeda: string, confirmada: boolean, taxaMicros: number | null): string {
  if (moeda === 'BRL') return 'Renda em reais: não há valor em dólar nem cotação.';
  if (confirmada && taxaMicros !== null) return 'A renda real confirmada guarda a cotação usada, mas não a data dela.';
  return 'A decomposição em dólar não está disponível para este ciclo (a configuração da renda mudou desde o início dele); vale o líquido congelado.';
}

export async function rendaDoCicloFerramenta(deps: Deps): Promise<SaidaFerramenta> {
  const resolvido = await lerCicloAtual(deps);
  if (!resolvido) return semCicloAberto(ORIGEM_RENDA);
  const { ciclo } = resolvido;
  const renda = montarRenda(ciclo, await deps.config.obter());

  return {
    moeda: renda.moeda,
    // Dólar não é par *Cents (esse sufixo é sempre BRL); sai com formatUSD.
    brutaUsdCentavosDeDolar: renda.brutaOrigemCents,
    brutaUsdFormatado: renda.brutaOrigemCents === null ? null : formatUSD(renda.brutaOrigemCents),
    cotacaoMicros: renda.taxaMicros,
    cotacaoFormatada: renda.taxaMicros === null ? null : formatTaxaBRL(renda.taxaMicros),
    dataCotacao: renda.dataCotacao,
    ...(renda.brutaOrigemCents === null || renda.taxaMicros === null || renda.dataCotacao === null
      ? { motivoSemCotacao: motivoSemCotacao(renda.moeda, renda.confirmada, renda.taxaMicros) }
      : {}),
    decomposicao: renda.decomposicao,
    confirmada: renda.confirmada,
    ...(renda.impostoCents === null
      ? {
          imposto: null,
          motivoSemImposto: 'A configuração da renda mudou desde o início do ciclo; a decomposição não fecha com o congelado.',
        }
      : dinheiro('imposto', renda.impostoCents)),
    ...dinheiros({ liquida: renda.liquidaCents, rendaPrevista: ciclo.rendaPrevistaCents }),
    ...(ciclo.rendaRealLiquidaCents === null
      ? {
          rendaReal: null,
          motivoSemRendaReal:
            'O dono ainda não confirmou a renda real deste ciclo; a renda do ciclo é a prevista.',
        }
      : dinheiro('rendaReal', ciclo.rendaRealLiquidaCents)),
    observacao:
      'A renda do ciclo é a real confirmada quando houver, senão a prevista. Cite `decomposicao` ' +
      'literalmente: ela já traz bruta, cotação e imposto formatados.',
    comoFoiCalculado: ORIGEM_RENDA,
  };
}
