'use client';

/**
 * Wizard de fechamento mensal (SPEC 7.2). Estado fica local até o passo
 * final — só chama `fecharCiclo` (server action) na confirmação. No sucesso,
 * troca para o resumo e dá `router.refresh()` para as demais telas (Hoje,
 * Ciclo, Análise) refletirem o fechamento.
 */
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatarDataCurta } from '@/shared/data';
import { Button } from '@/components/ui';
import { fecharCiclo, previaPoupancaRealAction } from '@/actions/ciclos';
import type { ResultadoFechamento, ResumoFechamento } from '@/application/fechamento';
import { PassoIndicador } from './passo-indicador';
import { PassoRenda } from './passo-renda';
import { TransacoesSemCategoria } from './transacoes-sem-categoria';
import { PassoSobra } from './passo-sobra';
import { PatrimonioEditor, type LinhaPatrimonio } from './patrimonio-editor';
import { PassoPoupancaReal, type PreviaPoupanca } from './passo-poupanca-real';
import { PassoMeta } from './passo-meta';
import { ResumoFinal } from './resumo-final';

const TOTAL_PASSOS = 6;

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
  const [rendaRealizadaCents, setRendaRealizadaCents] = useState(resumo.rendaSugeridaCents);
  const [snapshotData, setSnapshotData] = useState(hojeISO);
  const [linhas, setLinhas] = useState<LinhaPatrimonio[]>(() =>
    resumo.itensPatrimonioSugeridos.map((item, indice) => ({
      key: `sugerido-${indice}`,
      nome: item.nome,
      classe: item.classe,
      valorCents: item.valorCents,
      contaId: item.contaId ?? null,
    })),
  );
  const [aceitarNovaMeta, setAceitarNovaMeta] = useState(resumo.metaSugeridaCents != null);

  const [manual, setManual] = useState({ ativo: false, negativo: false, cents: 0 });
  const [previa, setPrevia] = useState<PreviaPoupanca | null>(resumo);
  const [carregandoPrevia, setCarregandoPrevia] = useState(false);

  const snapshotTotalCents = useMemo(() => {
    const preenchidas = linhas.filter((l) => l.nome.trim().length > 0);
    return preenchidas.length > 0 ? preenchidas.reduce((s, l) => s + l.valorCents, 0) : null;
  }, [linhas]);

  // A prévia do resumo só enxerga snapshots salvos; com o snapshot do fim digitado
  // no passo 4, a medição vem do servidor (mesma regra do fechamento, sem gravar).
  useEffect(() => {
    if (passo !== 5) return;
    if (snapshotTotalCents == null) {
      setPrevia(resumo);
      return;
    }
    let cancelado = false;
    setCarregandoPrevia(true);
    previaPoupancaRealAction(ciclo.id, snapshotData, snapshotTotalCents).then((r) => {
      if (cancelado) return;
      setPrevia(r.ok ? r.data : null);
      if (!r.ok) setErro(r.erro);
      setCarregandoPrevia(false);
    });
    return () => {
      cancelado = true;
    };
  }, [passo, snapshotTotalCents, snapshotData, ciclo.id, resumo]);

  const medida = previa?.medicao.status === 'MEDIDA';
  const poupancaPronta = !carregandoPrevia && (medida || manual.ativo);

  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoFechamento | null>(null);

  const avancar = () => setPasso((p) => Math.min(p + 1, TOTAL_PASSOS));
  const voltar = () => setPasso((p) => Math.max(p - 1, 1));

  const submeter = () => {
    setErro(null);
    const snapshotItens = linhas
      .filter((linha) => linha.nome.trim().length > 0)
      .map((linha) => ({
        nome: linha.nome.trim(),
        classe: linha.classe,
        valorCents: linha.valorCents,
        // Carrega adiante o vínculo com a conta. Reconstruir o item sem ele
        // faria o snapshot do fechamento nascer solto e a conciliação sumir
        // sem erro nenhum.
        contaId: linha.contaId ?? null,
      }));

    startTransition(async () => {
      const r = await fecharCiclo(ciclo.id, {
        rendaRealizadaCents,
        novaMetaPoupancaCents:
          resumo.metaSugeridaCents != null && aceitarNovaMeta ? resumo.metaSugeridaCents : null,
        snapshotData: snapshotItens.length > 0 ? snapshotData : undefined,
        snapshotItens: snapshotItens.length > 0 ? snapshotItens : undefined,
        poupancaRealManualCents:
          !medida && manual.ativo ? (manual.negativo ? -manual.cents : manual.cents) : null,
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
          rendaSugeridaCents={resumo.rendaSugeridaCents}
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
        <PassoPoupancaReal
          metaCents={ciclo.poupancaAlvoCents}
          previa={previa}
          carregando={carregandoPrevia}
          alertaGastoBaixo={resumo.alertaGastoBaixo}
          manual={manual}
          onChangeManual={setManual}
          onRegistrarSnapshot={() => setPasso(4)}
        />
      ) : null}

      {passo === 6 ? (
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
          <Button type="button" onClick={avancar} disabled={pending || (passo === 5 && !poupancaPronta)}>
            Continuar <ChevronRight size={18} />
          </Button>
        ) : (
          <Button type="button" onClick={submeter} disabled={pending || !poupancaPronta}>
            {pending ? 'Fechando…' : 'Fechar ciclo'}
          </Button>
        )}
      </div>
    </div>
  );
}

