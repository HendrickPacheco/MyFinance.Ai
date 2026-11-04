'use client';

import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, Label, Select } from '@/components/ui';
import { formatBRL } from '@/shared/dinheiro';
import { cn } from '@/lib/cn';
import type { ResumoFechamento } from '@/application/fechamento';
import { MoneyInput } from './money-input';

export type PreviaPoupanca = Pick<ResumoFechamento, 'medicao' | 'comparacao' | 'alertaFaltando'>;

/**
 * Passo 5: quanto o patrimônio de fato cresceu no ciclo. A meta é objetivo
 * (D-16), então aqui ela só serve de régua. Sem medição, o dono registra o
 * snapshot (volta ao passo 4) ou informa o valor à mão — o ciclo não fecha com 0 mudo.
 */
export function PassoPoupancaReal({
  metaCents,
  previa,
  carregando,
  alertaGastoBaixo,
  manual,
  onChangeManual,
  onRegistrarSnapshot,
}: {
  metaCents: number;
  previa: PreviaPoupanca | null;
  carregando: boolean;
  alertaGastoBaixo: ResumoFechamento['alertaGastoBaixo'];
  manual: { ativo: boolean; negativo: boolean; cents: number };
  onChangeManual: (m: { ativo: boolean; negativo: boolean; cents: number }) => void;
  onRegistrarSnapshot: () => void;
}) {
  const medida = previa?.medicao.status === 'MEDIDA' ? previa.medicao : null;
  const comparacao = previa?.comparacao ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>5. Poupança real do ciclo</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {carregando ? <p className="text-sm text-muted">Calculando…</p> : null}

        {medida && comparacao ? (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Item rotulo="Meta" valor={formatBRL(metaCents)} />
            <Item rotulo="Guardado de verdade" valor={formatBRL(medida.realCents)} />
            <Item
              rotulo="Diferença"
              valor={`${comparacao.diferencaCents >= 0 ? '+' : '-'}${formatBRL(Math.abs(comparacao.diferencaCents))}`}
              className={comparacao.diferencaCents >= 0 ? 'text-positivo' : 'text-negativo'}
            />
            <Item
              rotulo="% real da meta"
              valor={comparacao.percentual == null ? '—' : `${comparacao.percentual.toFixed(1)}%`}
            />
          </dl>
        ) : null}

        {!medida && !carregando ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">
              {previa?.medicao.status !== 'MEDIDA' && previa
                ? previa.medicao.motivo
                : 'Preencha o patrimônio do fim do ciclo no passo anterior para medir a poupança real.'}{' '}
              Registre o snapshot ou informe o valor manualmente para poder fechar.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="min-h-[44px] rounded-xl border border-border px-4 text-sm text-fg"
                onClick={() => onChangeManual({ ...manual, ativo: false })}
                aria-pressed={!manual.ativo}
              >
                Registrar snapshot
              </button>
              <button
                type="button"
                className="min-h-[44px] rounded-xl border border-border px-4 text-sm text-fg"
                onClick={() => onChangeManual({ ...manual, ativo: true })}
                aria-pressed={manual.ativo}
              >
                Informar manualmente
              </button>
            </div>
            {!manual.ativo ? (
              <button type="button" className="self-start text-sm text-accent underline" onClick={onRegistrarSnapshot}>
                Voltar ao patrimônio
              </button>
            ) : (
              <div className="flex gap-2">
                <div className="w-40">
                  <Label htmlFor="poupanca-sinal">Sentido</Label>
                  <Select
                    id="poupanca-sinal"
                    value={manual.negativo ? 'perdi' : 'guardei'}
                    onChange={(e) => onChangeManual({ ...manual, negativo: e.target.value === 'perdi' })}
                  >
                    <option value="guardei">Guardei</option>
                    <option value="perdi">Perdi patrimônio</option>
                  </Select>
                </div>
                <div className="flex-1">
                  <Label htmlFor="poupanca-manual">Valor</Label>
                  <MoneyInput
                    id="poupanca-manual"
                    valueCents={manual.cents}
                    onChangeCents={(c) => onChangeManual({ ...manual, cents: Math.abs(c) })}
                    aria-label="Poupança real manual"
                  />
                </div>
              </div>
            )}
          </div>
        ) : null}

        {previa?.alertaFaltando ? (
          <p className="text-sm text-recuperacao" role="status">
            {formatBRL(previa.alertaFaltando.semExplicacaoCents)} sem explicação — provavelmente há gastos não
            lançados.{' '}
            <Link href="/" className="underline">
              Lançar
            </Link>
          </p>
        ) : null}
        {alertaGastoBaixo ? (
          <p className="text-sm text-recuperacao" role="status">
            Seu gasto variável foi {Math.round(alertaGastoBaixo.percentual)}% da média dos ciclos anteriores —
            faltou lançar algo?{' '}
            <Link href="/" className="underline">
              Lançar
            </Link>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Item({ rotulo, valor, className }: { rotulo: string; valor: string; className?: string }) {
  return (
    <div>
      <dt className="text-sm text-muted">{rotulo}</dt>
      <dd className={cn('tnum text-lg font-semibold text-fg', className)}>{valor}</dd>
    </div>
  );
}
