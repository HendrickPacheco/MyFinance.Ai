/**
 * O bloco "Custos fixos" por dentro (G8).
 *
 * Duas honestidades que este cartão existe para contar:
 *
 * 1. O bloco vale o valor CONGELADO quando o ciclo nasceu (regra 3); o
 *    detalhamento por categoria vale o cadastro de hoje. Quando um custo fixo
 *    é criado, alterado ou desativado no meio do ciclo os dois divergem — e a
 *    divergência é informação, não erro a esconder (D-13).
 * 2. Custo fixo sem categoria aparece, com contagem (D-14). É o estado real do
 *    dono hoje: os custos cadastrados antes da G0 nasceram com `categoriaId`
 *    nulo. Sumir com eles faria o detalhamento por categoria mentir sobre o
 *    próprio tamanho.
 */
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { formatBRL } from '@/shared/dinheiro';
import type { ResumoCustosFixos } from '@/domain/finance';

export function CustosFixosDaRenda({ resumo }: { resumo: ResumoCustosFixos }) {
  const { semCategoria } = resumo;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Custos fixos por dentro</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <ul className="divide-y divide-border">
          <Linha rotulo="Congelado neste ciclo" valorCents={resumo.congeladoNoCicloCents} />
          <Linha
            rotulo={`Cadastrados hoje (${resumo.quantidadeCadastrada})`}
            valorCents={resumo.cadastradosHojeCents}
          />
        </ul>

        {resumo.motivoDiferenca ? (
          <div className="rounded-[var(--radius-card)] border border-border bg-surface-2 px-4 py-3">
            <p className="tnum text-sm text-fg">
              Diferença de {formatBRL(resumo.diferencaCents)} entre o cadastro e o ciclo.
            </p>
            <p className="mt-1 text-xs text-muted">{resumo.motivoDiferenca}</p>
          </div>
        ) : null}

        {semCategoria.quantidade > 0 ? (
          <div className="rounded-[var(--radius-card)] border border-border bg-surface-2 px-4 py-3">
            <p className="tnum text-sm text-fg">
              {semCategoria.quantidade === 1
                ? '1 custo fixo sem categoria'
                : `${semCategoria.quantidade} custos fixos sem categoria`}{' '}
              · {formatBRL(semCategoria.totalCents)}
            </p>
            <p className="mt-1 text-xs text-muted">
              Eles aparecem em &ldquo;Sem categoria&rdquo; no agrupamento abaixo. Classificá-los em{' '}
              <Link href="/custos/fixos" className="text-accent underline underline-offset-2">
                Custos fixos
              </Link>{' '}
              é o que faz esta tela responder por moradia, serviços, saúde.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Linha({ rotulo, valorCents }: { rotulo: string; valorCents: number }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-2.5">
      <span className="text-sm text-fg">{rotulo}</span>
      <span className="tnum shrink-0 text-sm text-fg">{formatBRL(valorCents)}</span>
    </li>
  );
}
