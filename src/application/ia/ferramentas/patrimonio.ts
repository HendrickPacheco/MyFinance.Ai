/**
 * Ferramenta de patrimônio. Lê o último snapshot e os derivados já calculados
 * pelo motor — `mesesDeReserva` vem `null` quando ainda não há histórico de
 * ciclos fechados para conhecer o custo mensal médio, e isso é informação, não
 * erro: o copiloto deve dizer que não sabe em vez de estimar.
 */
import type { Deps } from '@/application/deps';
import { obterPatrimonio } from '@/application/patrimonio';
import { dinheiros, type SaidaFerramenta } from './saida';

const ORIGEM = 'domain/finance/patrimonio.ts: totalPatrimonioCents, mesesDeReserva';

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
    ...dinheiros({
      totalAtual: patrimonio.totalAtualCents,
      variacaoMensal: patrimonio.variacaoMensalCents,
      taxaAcumulacaoMedia: patrimonio.taxaAcumulacaoMediaCents,
    }),
    comoFoiCalculado: ORIGEM,
  };
}
