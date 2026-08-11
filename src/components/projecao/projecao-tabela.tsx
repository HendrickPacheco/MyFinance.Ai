/**
 * Mês a mês — o *table-view twin* da coluna empilhada (§3.4).
 *
 * NÃO É UM EXTRA DO GRÁFICO. É a superfície em que o dono confere número
 * contra a planilha que está substituindo, e é ela que carrega o valor exato
 * quando o gráfico só carrega a proporção. Some no mobile porque lá a leitura
 * principal é a lista com micro-barra (`projecao-lista-mobile.tsx`), que mostra
 * os mesmos números num formato que cabe em 375px.
 *
 * O BADGE DE FIM DE PARCELAMENTO FICA NA LINHA DO CICLO EM QUE A PARCELA
 * TERMINA — que é o ciclo ANTERIOR ao do alívio. A última parcela de jan/27
 * ainda consome verba em jan/27; a verba só respira em fev/27. A manchete fala
 * do ciclo do alívio, a tabela fala do ciclo do término, e as duas estão certas:
 * são fatos diferentes. Não "corrija" uma pela outra.
 *
 * Nenhuma soma acontece aqui: as células são campos do read-model, e o total
 * das faixas (que NÃO é a renda prevista — ver a nota de rodapé) já vem
 * calculado como `totalComposicaoCents`.
 */
import {
  Badge,
  Table,
  TBody,
  THead,
  Td,
  Th,
  Tr,
} from '@/components/ui';
import { formatBRL } from '@/shared/dinheiro';
import { cn } from '@/lib/cn';
import type { LinhaProjecao } from '@/application/projecao-view';
import type { FimDeParcelamento } from '@/domain/finance';

/**
 * O primeiro ciclo não tem Δ — e "R$ 0,00" afirmaria uma comparação que não
 * existe. Travessão, não zero.
 */
function formatarDelta(cents: number | null): string {
  if (cents === null) return '—';
  return cents > 0 ? `+${formatBRL(cents)}` : formatBRL(cents);
}

function corDoDelta(cents: number | null): string {
  if (cents === null || cents === 0) return 'text-muted';
  return cents > 0 ? 'text-positivo' : 'text-negativo';
}

function rotuloDeTermino(fim: FimDeParcelamento): string {
  const nome = fim.descricao ?? 'Parcelamento sem descrição';
  return `${nome} acaba · +${formatBRL(fim.valorMensalCents)}/mês`;
}

function LinhaTabela({ linha }: { linha: LinhaProjecao }) {
  const deficit = linha.verbaLivreCents < 0;
  const temTermino = linha.terminamNesteCiclo.length > 0;

  return (
    <>
      <Tr className={temTermino ? 'border-b-0' : undefined}>
        <Td className="whitespace-nowrap font-medium text-fg">
          {linha.periodoLabel}
          {linha.abaixoDoPiso ? (
            <Badge tone="atencao" className="ml-2 align-middle">
              abaixo do piso
            </Badge>
          ) : null}
        </Td>
        <Td numerico className="text-muted">
          {formatBRL(linha.rendaPrevistaCents)}
        </Td>
        <Td numerico className="text-muted">
          {formatBRL(linha.fixosCents)}
        </Td>
        <Td numerico className="text-muted">
          {formatBRL(linha.provisaoMensalCents)}
        </Td>
        <Td numerico className="text-muted">
          {formatBRL(linha.poupancaAlvoCents)}
        </Td>
        <Td numerico className="text-muted">
          {formatBRL(linha.parcelasComprometidasCents)}
        </Td>
        <Td numerico className={cn('font-semibold', deficit ? 'text-negativo' : 'text-fg')}>
          {formatBRL(linha.verbaLivreCents)}
        </Td>
        <Td numerico className={corDoDelta(linha.deltaVerbaLivreCents)}>
          {formatarDelta(linha.deltaVerbaLivreCents)}
        </Td>
      </Tr>

      {temTermino ? (
        <Tr>
          {/* Segunda linha em vez de célula extra: o badge pertence ao mês
              inteiro, não a uma coluna, e assim ele não espreme os números. */}
          <Td colSpan={8} className="pt-0">
            <span className="flex flex-wrap gap-2">
              {linha.terminamNesteCiclo.map((fim) => (
                <Badge key={fim.parcelamentoId} tone="positivo">
                  ⬆ {rotuloDeTermino(fim)}
                </Badge>
              ))}
            </span>
          </Td>
        </Tr>
      ) : null}
    </>
  );
}

export function ProjecaoTabela({ linhas }: { linhas: readonly LinhaProjecao[] }) {
  if (linhas.length === 0) return null;

  return (
    <div className="hidden lg:block">
      <Table
        legenda={`Projeção mês a mês, ${String(linhas.length)} ciclos, com renda prevista, custos fixos, provisão, poupança-alvo, parcelas, verba livre e variação da verba livre.`}
        className="min-w-[56rem]"
      >
        <THead>
          <Tr>
            <Th>Mês</Th>
            <Th numerico>Renda</Th>
            <Th numerico>Fixos</Th>
            <Th numerico>Provisão</Th>
            <Th numerico>Poupança</Th>
            <Th numerico>Parcelas</Th>
            <Th numerico>Verba livre</Th>
            <Th numerico>Δ</Th>
          </Tr>
        </THead>
        <TBody>
          {linhas.map((linha) => (
            <LinhaTabela key={linha.inicio} linha={linha} />
          ))}
        </TBody>
      </Table>

      {/*
        O topo da pilha NÃO é a renda prevista, e quem somar as colunas vai
        descobrir isso sozinho — melhor dizer antes. A soma das cinco faixas é
        `renda + rollover`; e no ciclo atual, se houve `puxarDaReserva`, vale a
        verba congelada (SPEC 5.2), que não é a soma das partes.
      */}
      <p className="mt-3 text-xs text-faint">
        Fixos + provisão + poupança + parcelas + verba livre somam o total das faixas do gráfico —
        que inclui o rollover do ciclo anterior e, no ciclo atual, respeita a verba congelada. Por
        isso essa soma nem sempre é igual à renda prevista. O CSV traz esse total na coluna “Total
        das faixas”.
      </p>
    </div>
  );
}
