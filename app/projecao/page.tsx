import Link from 'next/link';
import { criarDeps } from '@/composition';
import { ConfigAusenteError } from '@/application/ciclos';
import { obterResumoProjecao } from '@/application/projecao-view';
import { Card, CardContent, CardHeader, CardTitle, EmptyState } from '@/components/ui';
import { ProjecaoStackChart } from '@/components/projecao/projecao-stack-chart';
import { ProjecaoKpis } from '@/components/projecao/projecao-kpis';
import { ProjecaoFiltros } from '@/components/projecao/projecao-filtros';
import { ProjecaoTabela } from '@/components/projecao/projecao-tabela';
import { ProjecaoListaMobile } from '@/components/projecao/projecao-lista-mobile';
import { Premissas } from '@/components/projecao/premissas';
import { lerHorizonte } from '@/lib/projecao-horizonte';

export const dynamic = 'force-dynamic';

/**
 * `/projecao` — a verba livre mês a mês, e quando ela respira (§3.4).
 *
 * TRÊS COISAS QUE ESTA PAGE NÃO FAZ:
 *
 * 1. NÃO GRAVA (R5). `obterResumoProjecao` → `obterProjecao` lê o ciclo atual
 *    com `obterAtual` e nunca chama `garantirCicloAtual`. Abrir esta tela não
 *    pode criar ciclo: ela responde uma pergunta, e pergunta não tem efeito
 *    colateral no banco.
 * 2. NÃO CALCULA. Cada número vem pronto do read-model, que por sua vez vem do
 *    motor puro (CLAUDE.md regra 4). Aqui só há montagem de layout.
 * 3. NÃO CONFIA NO `?horizonte=`. `projetarCiclos` lança `RangeError` fora de
 *    [1, 60]; `lerHorizonte` reduz qualquer entrada a 6, 12 ou 24 antes de
 *    chegar lá. Sem isso, `?horizonte=999` seria um 500 na cara do dono.
 *
 * Tela de LEITURA: sem `SomenteDono`. Um VIEWER pode consultar a projeção pelo
 * mesmo motivo que pode consultar o ciclo — nada aqui escreve.
 */
export default async function ProjecaoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const horizonte = lerHorizonte((await searchParams).horizonte);
  const deps = await criarDeps();

  let resumo;
  try {
    resumo = await obterResumoProjecao(deps, { numCiclos: horizonte });
  } catch (erro) {
    if (!(erro instanceof ConfigAusenteError)) throw erro;
    return (
      <EmptyState
        titulo="Configure a renda e a meta primeiro"
        descricao="A projeção parte da renda prevista, dos custos fixos e da meta de poupança. Sem isso não há o que projetar."
        acao={
          <Link
            href="/config"
            className="inline-flex min-h-[44px] items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg"
          >
            Abrir configuração
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <header>
        <h1 className="text-lg font-semibold text-fg">Projeção</h1>
        <p className="mt-1 text-sm text-muted">
          Quanto sobra por mês depois de fixos, provisão, poupança e parcelas — e quando a verba
          respira.
        </p>
      </header>

      <ProjecaoFiltros horizonte={horizonte} />

      <ProjecaoKpis resumo={resumo} />

      <Card>
        <CardHeader>
          <CardTitle>Composição da renda, mês a mês</CardTitle>
        </CardHeader>
        <CardContent>
          <ProjecaoStackChart linhas={resumo.linhas} />
          <p className="text-sm text-muted lg:hidden">
            A composição de cada mês aparece na lista abaixo, com a mesma leitura de cores do
            gráfico do desktop.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mês a mês</CardTitle>
        </CardHeader>
        {/* `p-0` no mobile: a lista traça suas próprias divisórias de borda a borda. */}
        <CardContent className="p-0 lg:px-5 lg:pb-5">
          <ProjecaoTabela linhas={resumo.linhas} />
          <ProjecaoListaMobile linhas={resumo.linhas} />
        </CardContent>
      </Card>

      <Premissas premissas={resumo.premissas} />
    </div>
  );
}
