'use client';

/**
 * Wizard de fechamento mensal (SPEC 7.2). Estado fica local até o passo
 * final — só chama `fecharCiclo` (server action) na confirmação. No sucesso,
 * troca para o resumo e dá `router.refresh()` para as demais telas (Hoje,
 * Ciclo, Análise) refletirem o fechamento.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui';
import { fecharCiclo } from '@/actions/ciclos';
import type { ResultadoFechamento, ResumoFechamento } from '@/application/fechamento';
import { PassoIndicador } from './passo-indicador';
import { PassoRenda } from './passo-renda';
import { TransacoesSemCategoria } from './transacoes-sem-categoria';
import { PassoSobra } from './passo-sobra';
import { PatrimonioEditor, type LinhaPatrimonio } from './patrimonio-editor';
import { PassoMeta } from './passo-meta';
import { ResumoFinal } from './resumo-final';

const TOTAL_PASSOS = 5;

export function FecharCicloWizard({
  resumo,
  hojeISO,
}: {
  resumo: ResumoFechamento;
  hojeISO: string;
}) {
  const router = useRouter();
  const { ciclo } = resumo;

  const [passo, setPasso] = useState(1);
  const [rendaRealizadaCents, setRendaRealizadaCents] = useState(ciclo.rendaPrevistaCents);
  const [snapshotData, setSnapshotData] = useState(hojeISO);
  const [linhas, setLinhas] = useState<LinhaPatrimonio[]>(() =>
    resumo.itensPatrimonioSugeridos.map((item, indice) => ({
      key: `sugerido-${indice}`,
      nome: item.nome,
      classe: item.classe,
      valorCents: item.valorCents,
    })),
  );
  const [aceitarNovaMeta, setAceitarNovaMeta] = useState(resumo.metaSugeridaCents != null);

  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoFechamento | null>(null);

  const avancar = () => setPasso((p) => Math.min(p + 1, TOTAL_PASSOS));
  const voltar = () => setPasso((p) => Math.max(p - 1, 1));

  const submeter = () => {
    setErro(null);
    const snapshotItens = linhas
      .filter((linha) => linha.nome.trim().length > 0)
      .map((linha) => ({ nome: linha.nome.trim(), classe: linha.classe, valorCents: linha.valorCents }));

    startTransition(async () => {
      const r = await fecharCiclo(ciclo.id, {
        rendaRealizadaCents,
        novaMetaPoupancaCents:
          resumo.metaSugeridaCents != null && aceitarNovaMeta ? resumo.metaSugeridaCents : null,
        snapshotData: snapshotItens.length > 0 ? snapshotData : undefined,
        snapshotItens: snapshotItens.length > 0 ? snapshotItens : undefined,
      });
      if (r.ok) {
        setResultado(r.data);
        router.refresh();
      } else {
        setErro(r.erro);
      }
    });
  };

  if (resultado) {
    return <ResumoFinal resultado={resultado} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm text-muted">Fechamento do ciclo</p>
        <h1 className="tnum text-lg font-semibold text-fg">
          {formatarDataCurta(ciclo.dataInicio)} – {formatarDataCurta(ciclo.dataFim)}
        </h1>
        <PassoIndicador atual={passo} total={TOTAL_PASSOS} />
      </header>

      {passo === 1 ? (
        <PassoRenda
          rendaPrevistaCents={ciclo.rendaPrevistaCents}
          valueCents={rendaRealizadaCents}
          onChangeCents={setRendaRealizadaCents}
        />
      ) : null}

      {passo === 2 ? <TransacoesSemCategoria transacoes={resumo.transacoesSemCategoria} /> : null}

      {passo === 3 ? (
        <PassoSobra
          sobraCents={resumo.sobraCents}
          verbaVariavelCents={ciclo.verbaVariavelCents}
          gastoRealizadoCents={resumo.gastoRealizadoCents}
        />
      ) : null}

      {passo === 4 ? (
        <PatrimonioEditor
          data={snapshotData}
          onChangeData={setSnapshotData}
          linhas={linhas}
          onChangeLinhas={setLinhas}
        />
      ) : null}

      {passo === 5 ? (
        <PassoMeta
          metaAtualCents={ciclo.poupancaAlvoCents}
          metaSugeridaCents={resumo.metaSugeridaCents}
          aceitar={aceitarNovaMeta}
          onChangeAceitar={setAceitarNovaMeta}
        />
      ) : null}

      {erro ? <p className="text-sm text-negativo">{erro}</p> : null}

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={voltar} disabled={passo === 1 || pending}>
          <ChevronLeft size={18} /> Voltar
        </Button>
        {passo < TOTAL_PASSOS ? (
          <Button type="button" onClick={avancar} disabled={pending}>
            Continuar <ChevronRight size={18} />
          </Button>
        ) : (
          <Button type="button" onClick={submeter} disabled={pending}>
            {pending ? 'Fechando…' : 'Fechar ciclo'}
          </Button>
        )}
      </div>
    </div>
  );
}

function formatarDataCurta(data: string): string {
  const [, mes, dia] = data.split('-');
  return `${dia}/${mes}`;
}
