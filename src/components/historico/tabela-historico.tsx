/**
 * Tabela mês a mês do histórico, mais novo -> mais antigo (`estado.meses`).
 * Linha inteira é link para `/historico/[cicloId]` (drill-down).
 *
 * "Gasto total" = fixos + parcelas + variável (os três caminhos que gastam
 * dinheiro, tabela do CLAUDE.md). "Poupança" é dinheiro RESERVADO, nunca
 * gasto — fica em coluna separada com esse rótulo explícito, nunca somada ao
 * gasto total (regra 5).
 */
import Link from 'next/link';
import { Table, THead, TBody, TFoot, Tr, Th, Td } from '@/components/ui';
import { formatBRL } from '@/shared/dinheiro';
import { cn } from '@/lib/cn';
import type { EstadoHistorico, MesHistorico } from '@/application/historico-tipos';

function corSobra(cents: number | null): string {
  if (cents === null) return 'text-muted';
  if (cents < 0) return 'text-negativo';
  return 'text-fg';
}

function LinhaHistorico({ mes }: { mes: MesHistorico }) {
  return (
    <Tr className="relative">
      <Td className="whitespace-nowrap font-medium text-fg">
        <Link
          href={`/historico/${mes.cicloId}`}
          className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
        >
          <span className="sr-only">Ver detalhe de </span>
          {mes.rotulo}
        </Link>
      </Td>
      <Td numerico className="text-muted">
        {formatBRL(mes.rendaConsideradaCents)}
      </Td>
      <Td numerico className="text-muted">
        {formatBRL(mes.fixosCents)}
      </Td>
      <Td numerico className="text-muted">
        {formatBRL(mes.parceladosCents)}
      </Td>
      <Td numerico className="text-muted">
        {formatBRL(mes.variavelCents)}
      </Td>
      <Td numerico className="font-semibold text-fg">
        {formatBRL(mes.gastoTotalCents)}
      </Td>
      <Td numerico className="text-muted">
        {formatBRL(mes.poupancaAlvoCents)}
      </Td>
      <Td numerico className={cn('font-semibold', corSobra(mes.sobraCents))}>
        {mes.sobraCents === null ? '—' : formatBRL(mes.sobraCents)}
      </Td>
      <Td numerico className="text-muted">
        {mes.patrimonioFimCents === null ? (
          <span title={mes.motivoPatrimonioAusente ?? 'Sem snapshot até o fim do mês'}>—</span>
        ) : (
          formatBRL(mes.patrimonioFimCents)
        )}
      </Td>
    </Tr>
  );
}

export function TabelaHistorico({ estado }: { estado: EstadoHistorico }) {
  const { meses, totais } = estado;

  return (
    <Table
      legenda={`Histórico mês a mês, ${String(totais.meses)} ciclos fechados, com renda, fixos, parcelas, gasto variável, gasto total, poupança-alvo, sobra e patrimônio.`}
      className="min-w-[64rem]"
    >
      <THead>
        <Tr>
          <Th>Mês</Th>
          <Th numerico>Renda</Th>
          <Th numerico>Fixos</Th>
          <Th numerico>Parcelas</Th>
          <Th numerico>Variável</Th>
          <Th numerico>Gasto total</Th>
          <Th numerico title="Dinheiro reservado, não gasto">
            Poupança (meta)
          </Th>
          <Th numerico>Sobra</Th>
          <Th numerico>Patrimônio</Th>
        </Tr>
      </THead>
      <TBody>
        {meses.map((mes) => (
          <LinhaHistorico key={mes.cicloId} mes={mes} />
        ))}
      </TBody>
      <TFoot>
        <Tr className="hover:bg-transparent">
          <Td className="font-medium text-fg">
            Total · {totais.meses} {totais.meses === 1 ? 'mês' : 'meses'}
          </Td>
          <Td numerico>{formatBRL(totais.rendaCents)}</Td>
          <Td numerico>{formatBRL(totais.fixosCents)}</Td>
          <Td numerico>{formatBRL(totais.parceladosCents)}</Td>
          <Td numerico>{formatBRL(totais.variavelCents)}</Td>
          <Td numerico className="font-semibold text-fg">
            {formatBRL(totais.gastoTotalCents)}
          </Td>
          <Td numerico>{formatBRL(totais.poupancaAlvoCents)}</Td>
          <Td numerico>—</Td>
          <Td numerico>—</Td>
        </Tr>
        <Tr className="hover:bg-transparent">
          <Td colSpan={9} className="pt-1 text-xs text-faint">
            Média por mês: renda {formatBRL(totais.rendaMediaCents)} · gasto{' '}
            {formatBRL(totais.gastoMedioCents)}
          </Td>
        </Tr>
      </TFoot>
    </Table>
  );
}
