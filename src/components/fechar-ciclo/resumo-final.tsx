'use client';

import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { formatBRL } from '@/shared/dinheiro';
import { cn } from '@/lib/cn';
import type { ResultadoFechamento } from '@/application/fechamento';

/** Passo 6: resumo pós-fechamento, exibido após `fecharCiclo` retornar ok. */
export function ResumoFinal({ resultado }: { resultado: ResultadoFechamento }) {
  const deficit = resultado.sobraCents < 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 pt-4 text-center">
        <CheckCircle2 size={40} className="text-positivo" aria-hidden="true" />
        <h1 className="text-lg font-semibold text-fg">Ciclo fechado</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resumo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <p className="text-sm text-muted">{deficit ? 'Déficit registrado' : 'Sobra destinada'}</p>
            <p
              className={cn(
                'tnum text-2xl font-semibold',
                deficit ? 'text-recuperacao' : 'text-positivo',
              )}
            >
              {formatBRL(Math.abs(resultado.sobraCents))}
            </p>
          </div>

          <div>
            <p className="text-sm text-muted">Taxa de poupança efetiva</p>
            <p className="tnum text-2xl font-semibold text-fg">
              {(resultado.taxaPoupancaEfetiva * 100).toFixed(1)}%
            </p>
          </div>

          {resultado.variacaoPatrimonioCents != null ? (
            <div>
              <p className="text-sm text-muted">Variação de patrimônio</p>
              <p
                className={cn(
                  'tnum text-2xl font-semibold',
                  resultado.variacaoPatrimonioCents >= 0 ? 'text-positivo' : 'text-negativo',
                )}
              >
                {resultado.variacaoPatrimonioCents >= 0 ? '+' : '-'}
                {formatBRL(Math.abs(resultado.variacaoPatrimonioCents))}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Link
        href="/"
        className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-accent px-5 text-sm font-medium text-accent-fg transition-all active:scale-[0.98] hover:brightness-110"
      >
        Voltar para Hoje
      </Link>
    </div>
  );
}
