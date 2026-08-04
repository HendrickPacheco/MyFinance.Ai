/**
 * Ferramentas sobre o momento presente: hoje, ciclo atual, para onde o
 * dinheiro foi e o que falta pagar.
 *
 * Cada função é uma casca fina: chama o caso de uso, formata, devolve. Zero
 * aritmética monetária — se algum `if` sobre valor aparecer aqui, é regra
 * vazando e vira função pura em `src/domain/finance/` com teste.
 *
 * TODAS usam as variantes `*SomenteLeitura` (D1.5). As versões das telas
 * passam por `garantirCicloAtual`, que cria o ciclo se faltar — uma pergunta
 * não pode gravar no banco (decisão D-8).
 */
import type { Deps } from '@/application/deps';
import { obterEstadoHojeSomenteLeitura } from '@/application/hoje';
import { obterEstadoCicloSomenteLeitura } from '@/application/ciclo-view';
import { ritmoExibivel } from '@/domain/finance';
import { obterEstadoPainelSomenteLeitura } from '@/application/dashboard';
import { obterProjecao } from '@/application/projecao';
import { dinheiros, semCicloAberto, type SaidaFerramenta } from './saida';

const ORIGEM_HOJE = 'domain/finance/teto.ts: calcularTeto';
const ORIGEM_CICLO = 'domain/finance/ritmo.ts: indicadoresRitmo';
const ORIGEM_CATEGORIAS = 'domain/finance/agregacoes.ts: agregarGastoPorCategoria';
const ORIGEM_PAGAMENTOS = 'domain/finance/pagamentos.ts: resumoPagamentosCents';

export async function situacaoHoje(deps: Deps): Promise<SaidaFerramenta> {
  const estado = await obterEstadoHojeSomenteLeitura(deps);
  if (!estado) return semCicloAberto(ORIGEM_HOJE);

  return {
    hoje: estado.hoje,
    diasRestantesNoCiclo: estado.teto.diasRestantes,
    emRecuperacao: estado.teto.emRecuperacao,
    ...dinheiros({
      tetoHoje: estado.teto.tetoHojeCents,
      gastoHoje: estado.teto.gastoHojeCents,
      restaHoje: estado.teto.restaHojeCents,
      saldoDisponivelNoCiclo: estado.teto.saldoDisponivelCents,
      deficitRecuperacao: estado.recuperacao.deficitCents,
    }),
    comoFoiCalculado: ORIGEM_HOJE,
  };
}

/**
 * Devolve os TRÊS campos de verba juntos, cada um com rótulo de bolso
 * (SPEC 13). `verbaVariavel` é a verba do motor; `parcelasComprometidas` é o
 * que já está preso em parcela; `verbaLivre` é o que sobra de verdade.
 * Devolver só um deles é o caminho mais curto para o copiloto dizer o número
 * certo com o nome errado.
 */
export async function estadoCiclo(deps: Deps): Promise<SaidaFerramenta> {
  const estado = await obterEstadoCicloSomenteLeitura(deps);
  if (!estado) return semCicloAberto(ORIGEM_CICLO);

  const projecao = await obterProjecao(deps, { numCiclos: 1 });
  const atual = projecao.ciclos[0];
  if (!atual) return semCicloAberto(ORIGEM_CICLO);

  const ritmo = ritmoExibivel(estado.ritmo);

  return {
    inicio: atual.inicio,
    fim: atual.fim,
    diasDecorridos: estado.ritmo.diasDecorridos,
    diasTotaisCiclo: estado.ritmo.diasTotaisCiclo,
    ritmo: estado.ritmo.ritmo,
    rotulos: {
      verbaVariavel: 'verba do ciclo, antes de descontar parcela',
      parcelasComprometidas: 'já preso em parcelas que caem neste ciclo',
      verbaLivre: 'o que sobra de verdade: verba variável menos parcelas',
    },
    ...dinheiros({
      verbaVariavel: atual.verbaVariavelCents,
      parcelasComprometidas: atual.parcelasComprometidasCents,
      verbaLivre: atual.verbaLivreCents,
      gastoRealizado: estado.gastoRealizadoCents,
      // Indicadores de ritmo são fracionários por natureza; o arredondamento
      // para exibição é regra do domínio, não deste wrapper.
      mediaDiariaReal: ritmo.mediaDiariaRealCents,
      tetoDiarioInicial: ritmo.tetoInicialCents,
      projecaoFechamento: ritmo.projecaoFechamentoCents,
    }),
    comoFoiCalculado: ORIGEM_CICLO,
  };
}

export async function gastosPorCategoria(
  deps: Deps,
  argumentos: { limite: number | null },
): Promise<SaidaFerramenta> {
  const painel = await obterEstadoPainelSomenteLeitura(deps);
  if (!painel) return semCicloAberto(ORIGEM_CATEGORIAS);

  const fatias = argumentos.limite === null ? painel.categorias : painel.categorias.slice(0, argumentos.limite);

  return {
    periodo: painel.periodoLabel,
    categorias: fatias.map((c) => ({
      nome: c.nome,
      percentual: c.percentual,
      ...dinheiros({ total: c.totalCents }),
    })),
    ...dinheiros({ gastoVariavelTotal: painel.transacoesVariaveisTotalCents }),
    comoFoiCalculado: ORIGEM_CATEGORIAS,
  };
}

export async function pagamentosPendentes(deps: Deps): Promise<SaidaFerramenta> {
  const painel = await obterEstadoPainelSomenteLeitura(deps);
  if (!painel) return semCicloAberto(ORIGEM_PAGAMENTOS);

  return {
    periodo: painel.periodoLabel,
    custosFixosEmAberto: painel.custosFixos
      .filter((c) => !c.pago)
      .map((c) => ({ nome: c.nome, diaVencimento: c.diaVencimento, vencido: c.vencido, ...dinheiros({ valor: c.valorCents }) })),
    parcelasEmAberto: painel.parcelados
      .filter((p) => !p.pago)
      .map((p) => ({ descricao: p.descricao, parcela: `${p.parcelaAtual}/${p.numParcelas}`, data: p.data, ...dinheiros({ valor: p.valorParcelaCents }) })),
    ...dinheiros({
      faltaPagar: painel.kpis.faltaPagarCents,
      jaPaguei: painel.kpis.jaPagueiCents,
    }),
    comoFoiCalculado: ORIGEM_PAGAMENTOS,
  };
}
