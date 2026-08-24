/**
 * Os blocos de topo de "Para onde vai a renda" (G8) — a barra e a lista.
 *
 * 🔴 O QUE ESTA TELA NÃO PODE MOSTRAR: "Parcelamentos do ciclo" como bloco
 * irmão de "Custos fixos". Cada parcela consome o teto diário como qualquer
 * gasto (D-11), então ela já está dentro de "Disponível para gastar" — e
 * promovê-la a bloco de topo contaria os R$ 4.393,88 do dono duas vezes. Por
 * isso as subdivisões são renderizadas ANINHADAS, recuadas sob o bloco a que
 * pertencem, e nunca na mesma lista.
 *
 * Componente de servidor e de apresentação pura: recebe o read-model pronto e
 * não calcula dinheiro (regra 4). O único número derivado aqui é largura de
 * pixel.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { CORES_DESTINO_RENDA, CORES_SUBDIVISAO_DISPONIVEL } from '@/components/dashboard/cores';
import { formatBRL } from '@/shared/dinheiro';
import type {
  BlocoDaRenda,
  DestinoDaRenda,
  RazaoPercentual,
  SubdivisaoDoDisponivel,
} from '@/domain/finance';

/**
 * Percentual que pode não existir (D-14). Sem valor, imprime um travessão e
 * carrega o motivo no `title` — um "0%" ao lado de R$ 4.393,88 seria pior do
 * que não mostrar nada.
 */
function PercentualDoBloco({ razao, className }: { razao: RazaoPercentual; className: string }) {
  if (razao.valor === null) {
    return (
      <span className={className} title={razao.motivo ?? undefined}>
        —
      </span>
    );
  }
  return (
    <span className={className}>
      {razao.valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
    </span>
  );
}

/**
 * Segmentos da barra. Só os blocos POSITIVOS entram: um valor negativo
 * (ajuste de rollover, puxada da reserva) desenharia para fora da barra. O
 * bloco negativo não some — ele aparece inteiro na lista abaixo, com seu valor
 * e seu percentual, e a nota de rodapé diz que ele ficou fora do desenho.
 * Mesma escolha do gráfico de `/projecao`: clamp de DESENHO, nunca de cálculo.
 */
function segmentosDaBarra(blocos: readonly BlocoDaRenda[]): BlocoDaRenda[] {
  return blocos.filter((bloco) => bloco.valorCents > 0);
}

/**
 * A barra em texto, para quem não a vê. Sem isto ela é uma pilha de `div`s
 * mudos: o leitor de tela anuncia nada e a informação some para quem depende
 * dele. O `title` de cada segmento não resolve — não é exposto na navegação
 * por leitor de tela.
 */
function descreverBarra(segmentos: readonly BlocoDaRenda[], rendaCents: number): string {
  if (segmentos.length === 0) return 'Barra sem segmentos: nenhum bloco positivo neste ciclo.';

  const partes = segmentos.map(
    (bloco) => `${bloco.rotulo} ${formatBRL(bloco.valorCents)}`,
  );
  return `Composição da renda de ${formatBRL(rendaCents)}: ${partes.join('; ')}.`;
}

export function BlocosDaRenda({ destino }: { destino: DestinoDaRenda }) {
  const segmentos = segmentosDaBarra(destino.blocos);
  const foraDaBarra = destino.blocos.filter((bloco) => bloco.valorCents <= 0);

  // 🔴 O DENOMINADOR É A RENDA, não a soma do que foi desenhado.
  //
  // Normalizar pelos positivos fazia a barra deixar de representar fração da
  // renda assim que qualquer bloco fosse negativo: com rollover de +R$ 5.000,
  // "Poupança" ocupava 51,4% da largura enquanto a lista logo abaixo imprimia
  // 60,0% e a legenda entre as duas prometia que os blocos somavam exatamente
  // a renda. Três números discordando na mesma tela.
  //
  // Com a renda no denominador, a soma das larguras fica ABAIXO de 100% e a
  // folga aparece como espaço vazio à direita — que é a verdade: aquela parte
  // do disponível não veio desta renda.
  const base = destino.rendaDoCicloCents;

  return (
    <Card>
      <CardHeader>
        <CardTitle>A renda do ciclo</CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        <div>
          <p className="tnum text-2xl font-semibold text-fg">
            {formatBRL(destino.rendaDoCicloCents)}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            Os blocos abaixo somam exatamente esta renda.
          </p>
        </div>

        {base > 0 ? (
          <div
            role="img"
            aria-label={descreverBarra(segmentos, base)}
            className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2"
          >
            {segmentos.map((bloco) => (
              <div
                key={bloco.chave}
                aria-hidden="true"
                className="h-full"
                style={{
                  width: `${(bloco.valorCents / base) * 100}%`,
                  backgroundColor: CORES_DESTINO_RENDA[bloco.chave],
                }}
                title={`${bloco.rotulo}: ${formatBRL(bloco.valorCents)}`}
              />
            ))}
          </div>
        ) : null}

        <ul className="divide-y divide-border">
          {destino.blocos.map((bloco) => (
            <li key={bloco.chave} className="py-3">
              <LinhaDeBloco bloco={bloco} />

              {bloco.chave === 'DISPONIVEL_PARA_GASTAR' ? (
                <ul className="mt-3 space-y-2 border-l border-border pl-4">
                  {destino.disponivelParaGastar.subdivisoes.map((sub) => (
                    <li key={sub.chave}>
                      <LinhaDeSubdivisao subdivisao={sub} />
                    </li>
                  ))}
                </ul>
              ) : null}

              {bloco.nota ? <p className="mt-2 text-xs text-muted">{bloco.nota}</p> : null}

              {bloco.chave === 'NAO_EXPLICADO' && destino.motivoNaoExplicado ? (
                <p className="mt-2 text-xs text-muted">{destino.motivoNaoExplicado}</p>
              ) : null}
            </li>
          ))}
        </ul>

        {foraDaBarra.length > 0 ? (
          <p className="text-xs text-faint">
            {foraDaBarra.map((b) => b.rotulo).join(' e ')} não {foraDaBarra.length > 1 ? 'são' : 'é'}{' '}
            desenhado na barra: valor zero ou negativo não tem largura. O número está na lista
            acima e continua entrando na soma — a largura da barra é fração da renda, então o
            espaço vazio à direita é exatamente o que está no disponível sem ter vindo dela.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function LinhaDeBloco({ bloco }: { bloco: BlocoDaRenda }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: CORES_DESTINO_RENDA[bloco.chave] }}
        />
        <span className="truncate font-medium text-fg">{bloco.rotulo}</span>
      </div>
      <div className="flex shrink-0 items-baseline gap-2">
        <span className="tnum font-semibold text-fg">{formatBRL(bloco.valorCents)}</span>
        <PercentualDoBloco
          razao={bloco.percentualDaRenda}
          className="tnum w-14 text-right text-sm text-muted"
        />
      </div>
    </div>
  );
}

function LinhaDeSubdivisao({ subdivisao }: { subdivisao: SubdivisaoDoDisponivel }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: CORES_SUBDIVISAO_DISPONIVEL[subdivisao.chave] }}
        />
        <span className="truncate text-sm text-muted">{subdivisao.rotulo}</span>
      </div>
      <div className="flex shrink-0 items-baseline gap-2">
        <span className="tnum text-sm text-fg">{formatBRL(subdivisao.valorCents)}</span>
        <PercentualDoBloco
          razao={subdivisao.percentualDaRenda}
          className="tnum w-14 text-right text-xs text-faint"
        />
      </div>
    </div>
  );
}
