/**
 * Custos fixos + provisão mensal — dinheiro já comprometido no ciclo, nunca
 * apresentado como disponível (regra 5). Fica num bloco visualmente
 * separado da verba variável, com subtotais próprios.
 *
 * O checkbox "pago" é RASTREAMENTO puro (coluna "Pago?" da planilha antiga):
 * o valor do fixo já foi descontado da verba quando o ciclo nasceu, então
 * marcar como pago aqui não recalcula nada — só troca um booleano via
 * server action (ver `PagamentoToggle`). "Falta pagar"/"já paguei" ficam
 * dentro deste bloco de comprometido, nunca perto do número de "posso gastar
 * hoje" (SPEC regra 5).
 */
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, EmptyState, Badge } from '@/components/ui';
import { PagamentoToggle } from './pagamento-toggle';
import { formatBRL } from '@/shared/dinheiro';
import { marcarCustoFixoPago } from '@/actions/pagamentos';
import type { LinhaCustoFixo } from '@/application/dashboard-tipos';
import type { ProvisaoAnual } from '@/domain/model/entidades';
import type { DivergenciaCongelado } from '@/domain/finance';

/**
 * Linha "cadastro de hoje · diferença" abaixo do total congelado, visível só
 * quando os dois divergem (custo/provisão criado, alterado ou desativado no
 * meio do ciclo). Some no caso comum — SPEC regra 3, aparência intacta.
 */
function NotaDivergencia({ divergencia }: { divergencia: DivergenciaCongelado }) {
  if (divergencia.diferencaCents === 0) return null;

  const sinal = divergencia.diferencaCents > 0 ? '+' : '−';
  const diferencaAbs = formatBRL(Math.abs(divergencia.diferencaCents));

  return (
    <p
      className="tnum mt-1 text-xs text-muted"
      title={divergencia.motivoDiferenca ?? undefined}
    >
      Cadastro de hoje: {formatBRL(divergencia.cadastradoHojeCents)} · {sinal}
      {diferencaAbs} que só entra no{' '}
      <Link href="/ciclo" className="underline underline-offset-2">
        próximo ciclo (ou recalcule o atual)
      </Link>
    </p>
  );
}

export function ComprometidoLista({
  custosFixos,
  fixosTotalCents,
  divergenciaFixos,
  provisoes,
  provisaoMensalTotalCents,
  divergenciaProvisao,
}: {
  custosFixos: LinhaCustoFixo[];
  fixosTotalCents: number;
  divergenciaFixos: DivergenciaCongelado;
  provisoes: ProvisaoAnual[];
  provisaoMensalTotalCents: number;
  divergenciaProvisao: DivergenciaCongelado;
}) {
  const provisoesAtivas = provisoes.filter((p) => p.ativo);

  if (custosFixos.length === 0 && provisoesAtivas.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Custos fixos e provisões</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            titulo="Nenhum custo fixo cadastrado"
            descricao="Cadastre aluguel, assinaturas e outras contas recorrentes para elas entrarem no cálculo da verba."
            acao={
              <Link
                href="/config"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-accent px-5 font-medium text-accent-fg"
              >
                Ir para configuração
              </Link>
            }
          />
        </CardContent>
      </Card>
    );
  }

  const pagos = custosFixos.filter((c) => c.pago).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Custos fixos e provisões</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {custosFixos.length > 0 ? (
          <div>
            <ul className="divide-y divide-border">
              {custosFixos.map((custo) => (
                <li
                  key={custo.custoFixoId}
                  className="flex items-center justify-between gap-3 py-1 text-sm"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 truncate text-fg">{custo.nome}</span>
                      {custo.vencido ? <Badge tone="atencao">venceu, não pago</Badge> : null}
                    </div>
                    <p className="tnum mt-0.5 text-xs text-muted">
                      dia {custo.diaVencimento} · {formatBRL(custo.valorCents)}
                    </p>
                  </div>
                  <PagamentoToggle
                    id={`fixo-pago-${custo.custoFixoId}`}
                    itemLabel={custo.nome}
                    pago={custo.pago}
                    onToggle={marcarCustoFixoPago.bind(null, custo.custoFixoId)}
                  />
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
              <span className="text-sm font-medium text-fg">
                Total fixos
                {divergenciaFixos.diferencaCents !== 0 ? ' · congelado neste ciclo' : ''}
              </span>
              <span className="tnum text-lg font-semibold text-fg">
                {formatBRL(fixosTotalCents)}
              </span>
            </div>
            <NotaDivergencia divergencia={divergenciaFixos} />
            <p className="tnum mt-1 text-xs text-muted">
              {pagos} de {custosFixos.length} pagos no ciclo
            </p>
          </div>
        ) : null}

        {provisoesAtivas.length > 0 ? (
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-muted">Provisões anuais</p>
            <ul className="divide-y divide-border">
              {provisoesAtivas.map((provisao) => (
                <li key={provisao.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="min-w-0 truncate text-fg">{provisao.nome}</span>
                  <span className="tnum shrink-0 pl-3 text-muted">
                    acumulado {formatBRL(provisao.acumuladoCents)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
              <span className="text-sm font-medium text-fg">
                Provisão mensal
                {divergenciaProvisao.diferencaCents !== 0 ? ' · congelado neste ciclo' : ''}
              </span>
              <span className="tnum text-lg font-semibold text-fg">
                {formatBRL(provisaoMensalTotalCents)}
              </span>
            </div>
            <NotaDivergencia divergencia={divergenciaProvisao} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
