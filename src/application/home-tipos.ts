/**
 * Contrato do read-model da home (`obterEstadoHome`). Só tipos. Tudo chega
 * pronto para exibir: componente não faz aritmética monetária. Dinheiro em
 * centavos (`*Cents`); percentuais são inteiros 0–100; rótulos não monetários
 * ('07/11', '3/5', 'nov/26') já vêm formatados.
 */
import type { OpcaoCategoria } from './dashboard-tipos';
import type { ItemVencimento, StatusDiaADia } from '@/domain/finance';

/** Uma das maiores despesas de um grupo (fixo ou parcelado). */
export interface LinhaDespesa {
  /** `custoFixoId` (fixo) ou `transacaoId` (parcela). */
  id: string;
  nome: string;
  valorCents: number;
  pago: boolean;
  /** Parcela: '3/5' ou '4/4 · última'. Fixo: null. */
  rotulo: string | null;
}

export interface GrupoDespesa {
  totalCents: number;
  pagoCents: number;
  qtd: number;
  qtdPagas: number;
  pagoPercent: number;
  /** Até 4, maiores valores primeiro. */
  maiores: LinhaDespesa[];
  /** Quantas ficaram fora de `maiores`. */
  restantes: number;
}

export interface EstadoHome {
  /** Categorias do lançamento em texto (VARIAVEL na frente). */
  categoriasLancamento: OpcaoCategoria[];
  cabecalho: {
    /** Mês de hoje por extenso, ex.: 'Novembro'. */
    mesNome: string;
    diaDoCiclo: number;
    diasTotais: number;
    /** Iniciais do nome (ou email) do usuário; '?' sem dado. */
    iniciais: string;
  };
  /** Dia a dia (D1, `EstadoPainel.verbas`): "Posso gastar hoje" é o mesmo número do app inteiro. */
  hero: {
    /** `kpis.podeGastarHojeCents` (nunca negativo). */
    possoGastarHojeCents: number;
    /** Dia a dia usado no ciclo até hoje. */
    usadoDiaADiaCents: number;
    /** Dia a dia efetivo do ciclo (teto do ciclo, líquido de parcelas e meta; o estouro do dia a dia sai dos extras). */
    diaADiaCents: number;
    diasRestantes: number;
    /** usadoDiaADia / diaADia. */
    progressoPercent: number;
    /** Estado do dia a dia (`statusDiaADia`): ritmo, estouro (usando extras) ou ciclo sem verba para a meta. */
    status: StatusDiaADia;
    emRecuperacao: boolean;
  };
  extras: {
    /** Extras restantes no ciclo; NEGATIVO quando estourados (o dia a dia que passou do balde também come os extras). */
    disponivelCents: number;
    totalCents: number;
    /** disponível / total, 0–100 (0 quando estourados). */
    progressoPercent: number;
  };
  /** Poupança real estimada (D3). A meta é objetivo (D-16), nunca "reservada". */
  metaPoupanca: {
    /** Guardado no ciclo (estimado); null sem patrimônio de partida. */
    guardadoCents: number | null;
    alvoCents: number;
    /** guardado ÷ alvo, limitado a 0–100, inteiro; 0 sem guardado. */
    progressoPercent: number;
    /** Por que `guardadoCents` é null (D-14); null quando há dado. */
    motivoSemGuardado: string | null;
  };
  reserva: {
    /** Saldo das contas tipo RESERVA (numerador de `meses`). */
    totalCents: number;
    meses: number | null;
    metaMeses: 6;
    progressoPercent: number;
    /** Por que `meses` é null; null quando há dado. */
    motivoSemDado: string | null;
  };
  despesas: {
    totalCents: number;
    pagoCents: number;
    aPagarCents: number;
    fixoPercent: number;
    parceladoPercent: number;
    fixo: GrupoDespesa;
    parcelado: GrupoDespesa & {
      /** Parcelas cuja última cai neste ciclo; `mesSeguinte` ex.: 'dez'. */
      terminamEsteMes: { qtd: number; valorCents: number; mesSeguinte: string } | null;
    };
  };
  proximos7Dias: {
    itens: ItemVencimento[];
    /** Quantidade de itens (não é dinheiro). */
    total: number;
  };
  verbaLivre: {
    /** Primeiro rótulo 'nov/26', demais 'dez'. */
    pontos: { rotulo: string; verbaLivreCents: number }[];
    ultimoCents: number;
    /** Ex.: 'jun'; '' sem pontos. */
    ultimoMes: string;
    /** Índices (em `pontos`) do primeiro ao último ciclo com parcelamento terminando. */
    faixaParcelasTerminando: { inicioIdx: number; fimIdx: number } | null;
  };
}
