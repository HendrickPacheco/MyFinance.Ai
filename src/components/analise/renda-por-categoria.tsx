/**
 * "Para onde vai a renda", por categoria (G8).
 *
 * 🔴 A GUARDA QUE ESTE COMPONENTE EXISTE PARA CUMPRIR (§12.4.1 / D-15).
 * Um `CustoFixo` pode estar classificado numa categoria de grupo VARIAVEL —
 * "Mercado", por exemplo — que é a MESMA em que caem compras de verba. Um
 * total por categoria que não diz de onde veio cada pedaço não é gasto de
 * verba nem custo fixo: é a mistura que a regra 5 proíbe, invisível porque o
 * grupo some na agregação. Por isso nenhuma linha aqui mostra só o total —
 * cada uma abre as partes por origem, e a linha em que custo fixo encontra
 * gasto de verba recebe um aviso explícito.
 *
 * O aviso é SÓ para esse encontro. Parcela e gasto eventual são as duas
 * despesas de grupo VARIAVEL que consomem o mesmo teto diário (D-11): somá-las
 * é o gasto de verba da categoria, não mistura. Avisar ali tocava o alarme em
 * quase toda categoria — o dono tem 13 parcelamentos ativos — e afogava o caso
 * real no ruído.
 *
 * Este número NÃO é o gasto de verba do mês, e não substitui a tela Hoje nem
 * o ranking de corte: ali a pergunta é "quanto posso gastar", e o filtro de
 * grupo VARIAVEL continua valendo. Aqui a pergunta é "para onde vai a renda".
 */
import { Card, CardContent, CardHeader, CardTitle, Badge, EmptyState } from '@/components/ui';
import { formatBRL } from '@/shared/dinheiro';
import { SEM_CATEGORIA_ID } from '@/domain/finance';
import type { LinhaCategoriaDestinoView } from '@/application/destino-da-renda';

interface ParteExibivel {
  rotulo: string;
  valorCents: number;
}

/**
 * Só as partes que de fato contribuíram — parte zerada é ruído na leitura.
 *
 * Cada contagem acompanha o valor que ela descreve. O rótulo do realizado
 * carregava a contagem TOTAL de gastos eventuais: com uma compra de R$ 200
 * realizada e outra de R$ 300 programada, a linha lia "Gasto eventual (2)
 * R$ 200,00" — duas transações somando duzentos, o que não existe.
 */
function partesDaLinha(linha: LinhaCategoriaDestinoView): ParteExibivel[] {
  const { partes, quantidade } = linha;
  const candidatas: ParteExibivel[] = [
    { rotulo: `Custo fixo (${quantidade.custosFixos})`, valorCents: partes.custoFixoCents },
    { rotulo: `Parcelas (${quantidade.parcelas})`, valorCents: partes.parcelamentoCents },
    {
      rotulo: `Gasto eventual (${quantidade.gastosEventuaisRealizados})`,
      valorCents: partes.gastoEventualRealizadoCents,
    },
    {
      rotulo: `Gasto eventual programado (${quantidade.gastosEventuaisProgramados})`,
      valorCents: partes.gastoEventualProgramadoCents,
    },
  ];
  return candidatas.filter((parte) => parte.valorCents !== 0);
}

export function RendaPorCategoria({
  linhas,
  quantidadeComMistura,
}: {
  linhas: readonly LinhaCategoriaDestinoView[];
  quantidadeComMistura: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Por categoria</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-sm text-muted">
          Custo fixo, parcela e gasto eventual aparecem juntos por categoria — cada linha diz
          quanto veio de cada origem.
        </p>

        {quantidadeComMistura > 0 ? (
          <p className="rounded-[var(--radius-card)] border border-atencao/40 bg-atencao/10 px-4 py-3 text-sm text-fg">
            {quantidadeComMistura === 1
              ? '1 categoria soma custo fixo com gasto de verba'
              : `${quantidadeComMistura} categorias somam custo fixo com gasto de verba`}{' '}
            — o total {quantidadeComMistura === 1 ? 'dela' : 'delas'} não é uma coisa nem outra:
            custo fixo já está comprometido, gasto de verba sai do seu teto do dia. Leia as
            partes, não o total.
          </p>
        ) : null}

        {linhas.length === 0 ? (
          <EmptyState
            titulo="Nada classificado ainda neste ciclo"
            descricao="Sem custo fixo, parcela ou gasto lançado no ciclo atual não há o que agrupar por categoria."
          />
        ) : (
          <ul className="divide-y divide-border">
            {linhas.map((linha) => (
              <li key={linha.categoriaId ?? SEM_CATEGORIA_ID} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-fg">{linha.nome}</span>
                    {linha.misturaOrigens ? (
                      <Badge tone="atencao">custo fixo + verba</Badge>
                    ) : null}
                  </div>
                  <span className="tnum shrink-0 font-semibold text-fg">
                    {formatBRL(linha.totalCents)}
                  </span>
                </div>

                <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                  {partesDaLinha(linha).map((parte) => (
                    <div key={parte.rotulo} className="flex items-baseline gap-1.5">
                      <dt className="text-xs text-faint">{parte.rotulo}</dt>
                      <dd className="tnum text-xs text-muted">{formatBRL(parte.valorCents)}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
