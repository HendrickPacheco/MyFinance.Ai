/**
 * Ferramenta de patrimônio. Lê o último snapshot e os derivados já calculados
 * pelo motor — `mesesDeReserva` vem `null` quando ainda não há histórico de
 * ciclos fechados para conhecer o custo mensal médio, e isso é informação, não
 * erro: o copiloto deve dizer que não sabe em vez de estimar.
 *
 * O `null` sozinho não basta: emitido como booleano mudo, o modelo inventou a
 * razão ("seus custos fixos precisam estar registrados") mesmo com 12 custos
 * fixos cadastrados. Por isso a saída carrega SEMPRE o motivo em texto e
 * `custosFixosRegistrados`, fechando a porta para essa alucinação específica.
 */
import type { Deps } from '@/application/deps';
import { obterPatrimonio, type MotivoMesesDesconhecido } from '@/application/patrimonio';
import { dinheiros, type SaidaFerramenta } from './saida';

const ORIGEM = 'domain/finance/patrimonio.ts: totalPatrimonioCents, mesesDeReserva';

const MOTIVOS: Record<MotivoMesesDesconhecido, string> = {
  SEM_CICLO_FECHADO:
    'Nenhum ciclo foi fechado ainda, então o custo VARIÁVEL médio é desconhecido. ' +
    'Isto não tem relação com os custos fixos, que estão cadastrados normalmente. ' +
    'Use mesesDeReservaComprometidos como piso e diga que o variável ainda não entra na conta.',
  CUSTO_NAO_POSITIVO:
    'O custo mensal médio calculado não é positivo, então a divisão não faz sentido.',
};

export async function patrimonioResumo(deps: Deps): Promise<SaidaFerramenta> {
  const patrimonio = await obterPatrimonio(deps);

  if (!patrimonio.temDados) {
    return {
      semSnapshots: true,
      mensagem: 'Ainda não há nenhum snapshot de patrimônio registrado.',
      comoFoiCalculado: ORIGEM,
    };
  }

  return {
    snapshotsRegistrados: patrimonio.snapshots.length,
    mesesDeReserva: patrimonio.mesesDeReserva,
    mesesDeReservaDesconhecido: patrimonio.mesesDeReserva === null,
    ...(patrimonio.motivoMesesDesconhecido ? { motivoDesconhecido: MOTIVOS[patrimonio.motivoMesesDesconhecido] } : {}),
    // Cobertura mínima: responde "a reserva cobre meus fixos?" sem histórico.
    mesesDeReservaComprometidos: patrimonio.mesesDeReservaComprometidos,
    custosFixosRegistrados: true,
    ...(patrimonio.saldoReservaCents === 0
      ? {
          saldoReservaZerado: true,
          avisoSaldoReserva:
            'As contas do tipo RESERVA estão com saldo 0, então qualquer cobertura sai 0 meses. ' +
            'O valor do patrimônio vem dos snapshots, que são independentes do saldo das contas. ' +
            'Diga ao dono para preencher o saldo da conta de reserva em Ajustes > Contas.',
        }
      : {}),
    ...dinheiros({
      totalAtual: patrimonio.totalAtualCents,
      variacaoMensal: patrimonio.variacaoMensalCents,
      taxaAcumulacaoMedia: patrimonio.taxaAcumulacaoMediaCents,
      custoComprometidoMensal: patrimonio.custoComprometidoMensalCents,
      saldoReserva: patrimonio.saldoReservaCents,
    }),
    comoFoiCalculado: ORIGEM,
  };
}
