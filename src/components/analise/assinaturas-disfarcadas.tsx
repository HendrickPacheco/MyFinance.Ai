/**
 * Assinaturas disfarçadas (SPEC 5.5) — transações com mesmo valor e mesma
 * descrição normalizada em 3+ ciclos consecutivos: recorrência fixa que se
 * escondeu em uma categoria variável. Seção separada do ranking porque o
 * ponto de ação é diferente (virar custo fixo ou cancelar), não "gastar menos".
 */
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { formatBRL } from '@/shared/dinheiro';
import type { AssinaturaDetectada } from '@/domain/finance';

export function AssinaturasDisfarcadas({
  assinaturas,
}: {
  assinaturas: readonly AssinaturaDetectada[];
}) {
  if (assinaturas.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assinaturas disfarçadas</CardTitle>
        <p className="mt-1 text-sm text-muted">Recorrência fixa disfarçada de variável.</p>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border">
          {assinaturas.map((a) => (
            <li
              key={`${a.descricaoNormalizada}::${a.valorCents}`}
              className="flex items-start justify-between gap-3 px-5 py-4"
            >
              <div className="min-w-0">
                <p className="truncate font-medium capitalize text-fg">{a.descricaoNormalizada}</p>
                <p className="tnum mt-0.5 text-sm text-muted">{formatBRL(a.valorCents)} /mês</p>
                <p className="mt-0.5 text-sm text-faint">
                  em {a.ciclosConsecutivos} ciclos seguidos
                </p>
              </div>
              <p className="tnum shrink-0 text-lg font-semibold leading-tight text-fg">
                {formatBRL(a.custoAnualizadoCents)}
                <span className="ml-1 text-xs font-normal text-muted">/ano</span>
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
