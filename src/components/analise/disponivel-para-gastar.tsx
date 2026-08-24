/**
 * O detalhe de "Disponível para gastar" (G8): compromisso × escolha.
 *
 * Por que as duas linhas nunca viram um número só (§12.2.1): parcelamento é
 * compromisso que o dono já sabe que vem; gasto eventual é o que ele ainda
 * decide. O número que responde "quanto posso gastar sem me enrolar" é o
 * segundo — fundir os dois apagaria justamente essa diferença.
 *
 * "Gastos eventuais do mês" é ORÇAMENTO, e as três linhas abaixo dele são o
 * que aconteceu contra esse orçamento: realizado (já saiu), programado
 * (competência futura já lançada, ainda não consome teto) e o que ainda não
 * tem destino. As três somam o orçamento — não são um segundo total.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { CORES_SUBDIVISAO_DISPONIVEL } from '@/components/dashboard/cores';
import { formatBRL } from '@/shared/dinheiro';
import type { DisponivelParaGastar as DisponivelParaGastarModel } from '@/domain/finance';

export function DisponivelParaGastar({ disponivel }: { disponivel: DisponivelParaGastarModel }) {
  const estourado = disponivel.aindaSemDestinoCents < 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Disponível para gastar</CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        <p className="tnum text-2xl font-semibold text-fg">{formatBRL(disponivel.totalCents)}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Bloco
            cor={CORES_SUBDIVISAO_DISPONIVEL.PARCELAMENTOS_DO_CICLO}
            titulo="Parcelamentos do ciclo"
            valorCents={disponivel.parcelamentosDoCicloCents}
            descricao="Compromisso já assumido: as parcelas que caem neste mês."
          />
          <Bloco
            cor={CORES_SUBDIVISAO_DISPONIVEL.GASTOS_EVENTUAIS_DO_MES}
            titulo="Gastos eventuais do mês"
            valorCents={disponivel.gastosEventuaisDoMesCents}
            descricao="O que resta depois das parcelas — é este o número da decisão."
          />
        </div>

        <ul className="divide-y divide-border border-t border-border">
          <Linha rotulo="Já saiu até hoje" valorCents={disponivel.realizadoAteHojeCents} />
          <Linha
            rotulo="Programado no ciclo"
            detalhe="lançado com competência futura; ainda não consome o teto"
            valorCents={disponivel.programadoNoCicloCents}
          />
          <Linha
            rotulo={estourado ? 'Passou do orçamento' : 'Ainda sem destino'}
            valorCents={disponivel.aindaSemDestinoCents}
            negativo={estourado}
          />
        </ul>
      </CardContent>
    </Card>
  );
}

function Bloco({
  cor,
  titulo,
  valorCents,
  descricao,
}: {
  cor: string;
  titulo: string;
  valorCents: number;
  descricao: string;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border p-4">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: cor }} />
        <p className="text-sm font-medium text-fg">{titulo}</p>
      </div>
      <p className="tnum mt-1 text-lg font-semibold text-fg">{formatBRL(valorCents)}</p>
      <p className="mt-1 text-xs text-muted">{descricao}</p>
    </div>
  );
}

function Linha({
  rotulo,
  detalhe,
  valorCents,
  negativo = false,
}: {
  rotulo: string;
  detalhe?: string;
  valorCents: number;
  negativo?: boolean;
}) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm text-fg">{rotulo}</p>
        {detalhe ? <p className="text-xs text-faint">{detalhe}</p> : null}
      </div>
      <span className={`tnum shrink-0 text-sm ${negativo ? 'text-negativo' : 'text-fg'}`}>
        {formatBRL(valorCents)}
      </span>
    </li>
  );
}
