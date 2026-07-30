/**
 * Card "Composição da verba" (SPEC 7): renda prevista − poupança − fixos −
 * provisão (+ rollover se ≠0) = verba variável. Puramente apresentacional —
 * sem interação, então fica Server Component.
 */
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { formatBRL } from '@/shared/dinheiro';
import { cn } from '@/lib/cn';
import type { Ciclo } from '@/domain/model/entidades';

interface LinhaComposicao {
  rotulo: string;
  valorCents: number;
  sinal: 1 | -1;
}

export function ComposicaoVerbaCard({ ciclo }: { ciclo: Ciclo }) {
  const linhas: LinhaComposicao[] = [
    { rotulo: 'Renda prevista', valorCents: ciclo.rendaPrevistaCents, sinal: 1 },
    { rotulo: 'Poupança alvo', valorCents: ciclo.poupancaAlvoCents, sinal: -1 },
    { rotulo: 'Custos fixos', valorCents: ciclo.fixosCents, sinal: -1 },
    { rotulo: 'Provisão mensal', valorCents: ciclo.provisaoMensalCents, sinal: -1 },
  ];

  if (ciclo.rolloverRecebidoCents !== 0) {
    const positivo = ciclo.rolloverRecebidoCents > 0;
    linhas.push({
      rotulo: positivo ? 'Rollover recebido' : 'Rollover devido',
      valorCents: Math.abs(ciclo.rolloverRecebidoCents),
      sinal: positivo ? 1 : -1,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Composição da verba</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {linhas.map((linha) => (
            <li key={linha.rotulo} className="flex items-center justify-between text-sm">
              <span className="text-muted">{linha.rotulo}</span>
              <span className="tnum text-fg">
                {linha.sinal === 1 ? '+' : '−'} {formatBRL(linha.valorCents)}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
          <span className="text-sm font-medium text-fg">Verba variável</span>
          <span className={cn('tnum text-2xl font-semibold text-accent')}>
            {formatBRL(ciclo.verbaVariavelCents)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
