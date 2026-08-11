import { criarDeps } from '@/composition';
import { obterPatrimonio, sugestaoItensSnapshot } from '@/application/patrimonio';
import { Card, CardContent, CardHeader, CardTitle, EmptyState } from '@/components/ui';
import { ConciliacaoPatrimonio } from '@/components/patrimonio/conciliacao-patrimonio';
import { CurvaPatrimonioChart } from '@/components/patrimonio/curva-patrimonio-chart';
import { HistoricoSnapshots } from '@/components/patrimonio/historico-snapshots';
import { NovoSnapshotForm } from '@/components/patrimonio/novo-snapshot-form';
import { ResumoPatrimonio } from '@/components/patrimonio/resumo-patrimonio';

export const dynamic = 'force-dynamic';

export default async function PatrimonioPage() {
  const deps = await criarDeps();
  const [estado, itensSugeridos, contas] = await Promise.all([
    obterPatrimonio(deps),
    sugestaoItensSnapshot(deps),
    deps.contas.listar({ incluirArquivadas: false }),
  ]);
  const hojeISO = deps.relogio.hoje();
  const contasVinculaveis = contas.map((c) => ({ id: c.id, nome: c.nome }));

  return (
    <div className="mx-auto w-full space-y-8 lg:max-w-4xl">
      <ResumoPatrimonio
        mesesDeReserva={estado.mesesDeReserva}
        totalAtualCents={estado.totalAtualCents}
        variacaoMensalCents={estado.variacaoMensalCents}
        taxaAcumulacaoMediaCents={estado.taxaAcumulacaoMediaCents}
        temDados={estado.temDados}
      />

      <ConciliacaoPatrimonio divergencias={estado.divergencias} />

      <Card>
        <CardHeader>
          <CardTitle>Curva de patrimônio</CardTitle>
        </CardHeader>
        <CardContent>
          <CurvaPatrimonioChart curva={estado.curva} />
        </CardContent>
      </Card>

      {!estado.temDados ? (
        <EmptyState
          titulo="Comece registrando seu patrimônio"
          descricao="Crie o primeiro snapshot abaixo para começar a acompanhar sua curva de patrimônio e sua reserva de segurança."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Histórico de snapshots</CardTitle>
          </CardHeader>
          <CardContent>
            <HistoricoSnapshots snapshots={estado.snapshots} />
          </CardContent>
        </Card>
      )}

      <NovoSnapshotForm
        itensSugeridos={itensSugeridos}
        hojeISO={hojeISO}
        contas={contasVinculaveis}
        datasComSnapshot={estado.snapshots.map((s) => s.data)}
      />
    </div>
  );
}
