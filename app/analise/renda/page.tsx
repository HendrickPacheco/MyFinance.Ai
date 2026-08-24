import Link from 'next/link';
import { criarDeps } from '@/composition';
import { ConfigAusenteError } from '@/application/ciclos';
import {
  obterDestinoDaRendaSomenteLeitura,
  type EstadoDestinoDaRenda,
} from '@/application/destino-da-renda';
import type { Deps } from '@/application/deps';
import { EmptyState } from '@/components/ui';
import { ContentHeader } from '@/components/layout/content-header';
import { BlocosDaRenda } from '@/components/analise/blocos-da-renda';
import { DisponivelParaGastar } from '@/components/analise/disponivel-para-gastar';
import { CustosFixosDaRenda } from '@/components/analise/custos-fixos-da-renda';
import { RendaPorCategoria } from '@/components/analise/renda-por-categoria';

export const dynamic = 'force-dynamic';

/**
 * `/analise/renda` — "para onde vai a renda?" (G8, TASKS-GRAFO §12).
 *
 * TRÊS COISAS QUE ESTA PAGE NÃO FAZ:
 *
 * 1. NÃO GRAVA. `obterDestinoDaRendaSomenteLeitura` lê o ciclo com
 *    `lerCicloAtual` e nunca chama `garantirCicloAtual` — abrir uma tela que
 *    responde uma pergunta não pode criar ciclo no banco.
 * 2. NÃO CALCULA. Todo número vem do motor puro (`domain/finance/
 *    destino-da-renda.ts`) via read-model. Aqui só há montagem de layout.
 * 3. NÃO MEXE NO RECORTE DAS OUTRAS TELAS. Hoje e Análise de corte continuam
 *    filtrando `grupo === 'VARIAVEL'` (regra 5) — elas respondem "quanto posso
 *    gastar". Esta responde outra pergunta e por isso mostra tudo, inclusive
 *    custo fixo e provisão.
 *
 * Tela de LEITURA: sem `SomenteDono`, como `/projecao` e `/analise`.
 */
/**
 * Config ausente é onboarding incompleto, não falha: vira o mesmo estado vazio
 * de "sem ciclo aberto", com o caminho para resolver. Sem isto a tela seria um
 * 500 na cara de quem ainda não configurou renda e dia de recebimento.
 */
async function lerEstado(deps: Deps): Promise<EstadoDestinoDaRenda | null> {
  try {
    return await obterDestinoDaRendaSomenteLeitura(deps);
  } catch (erro) {
    if (erro instanceof ConfigAusenteError) return null;
    throw erro;
  }
}

export default async function ParaOndeVaiARendaPage() {
  const deps = await criarDeps();
  const estado = await lerEstado(deps);

  if (!estado) {
    return (
      <EmptyState
        titulo="Ainda não há um ciclo aberto"
        descricao="Esta visão decompõe a renda do ciclo em curso. Confira a configuração de renda e dia de recebimento para que o ciclo do período seja criado."
        acao={
          <Link href="/config" className="text-accent underline underline-offset-2">
            Ir para Ajustes
          </Link>
        }
      />
    );
  }

  const { destino } = estado;

  return (
    <div className="space-y-6">
      <ContentHeader titulo="Para onde vai a renda" periodo={estado.periodoLabel} />

      <div className="lg:hidden">
        <h1 className="text-xl font-semibold text-fg">Para onde vai a renda</h1>
        <p className="tnum mt-0.5 text-sm text-muted">{estado.periodoLabel}</p>
      </div>

      <BlocosDaRenda destino={destino} />
      <DisponivelParaGastar disponivel={destino.disponivelParaGastar} />
      <CustosFixosDaRenda resumo={destino.custosFixos} />
      <RendaPorCategoria
        linhas={estado.porCategoria}
        quantidadeComMistura={estado.categoriasComMisturaDeOrigem.length}
      />
    </div>
  );
}
