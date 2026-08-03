/**
 * Custos fixos + provisão mensal — dinheiro já comprometido no ciclo, nunca
 * apresentado como disponível (regra 5). Fica num bloco visualmente
 * separado da verba variável, com subtotais próprios.
 */
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, EmptyState } from '@/components/ui';
import { formatBRL } from '@/shared/dinheiro';
import type { CustoFixo, ProvisaoAnual } from '@/domain/model/entidades';

export function ComprometidoLista({
  custosFixos,
  fixosTotalCents,
  provisoes,
  provisaoMensalTotalCents,
}: {
  custosFixos: CustoFixo[];
  fixosTotalCents: number;
  provisoes: ProvisaoAnual[];
  provisaoMensalTotalCents: number;
}) {
  const fixosAtivos = custosFixos.filter((c) => c.ativo);
  const provisoesAtivas = provisoes.filter((p) => p.ativo);

  if (fixosAtivos.length === 0 && provisoesAtivas.length === 0) {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Custos fixos e provisões</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {fixosAtivos.length > 0 ? (
          <div>
            <ul className="divide-y divide-border">
              {fixosAtivos.map((custo) => (
                <li key={custo.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="min-w-0 truncate text-fg">{custo.nome}</span>
                  <span className="tnum shrink-0 pl-3 text-muted">
                    dia {custo.diaVencimento} · {formatBRL(custo.valorCents)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
              <span className="text-sm font-medium text-fg">Total fixos</span>
              <span className="tnum text-lg font-semibold text-fg">
                {formatBRL(fixosTotalCents)}
              </span>
            </div>
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
              <span className="text-sm font-medium text-fg">Provisão mensal</span>
              <span className="tnum text-lg font-semibold text-fg">
                {formatBRL(provisaoMensalTotalCents)}
              </span>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
