/**
 * Contrato do read-model da home (`obterEstadoHome`). Só tipos. Tudo chega
 * pronto para exibir: componente não faz aritmética monetária. Dinheiro em
 * centavos (`*Cents`); percentuais são inteiros 0–100; rótulos não monetários
 * ('07/11', '3/5', 'nov/26') já vêm formatados.
 */
import type { DivisaoDiaADia, ItemVencimento } from '@/domain/finance';

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
  cabecalho: {
    /** Mês de hoje por extenso, ex.: 'Novembro'. */
    mesNome: string;
    diaDoCiclo: number;
    diasTotais: number;
    /** Iniciais do nome (ou email) do usuário; '?' sem dado. */
    iniciais: string;
  };
  /** Divisão dia a dia/extras (D-16: a meta é objetivo; aqui só limita o gastável). */
  hero: DivisaoDiaADia & {
    diasRestantes: number;
    /** usadoDiaADia / diaADia. */
    progressoPercent: number;
    emRecuperacao: boolean;
  };
  extras: {
    disponivelCents: number;
    totalCents: number;
    /** disponível / total. */
    progressoPercent: number;
  };
  metaPoupanca: {
    /** Sobra projetada no fechamento. */
    projetadaCents: number;
    alvoCents: number;
    progressoPercent: number;
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
