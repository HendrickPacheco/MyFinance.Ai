import Link from 'next/link';
import type { EstadoHome, GrupoDespesa } from '@/application/home-tipos';
import { formatarNumeroBRL } from '@/shared/dinheiro';
import { Barra, Card, Valor } from './ui-home';

type Despesas = EstadoHome['despesas'];

function SeloPago() {
  return (
    <i className="inline-flex items-center gap-[3px] rounded-full bg-positivo-soft py-0.5 pl-[5px] pr-2 text-[11px] font-semibold not-italic text-positivo">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 12l5 5 9-10" />
      </svg>
      pago
    </i>
  );
}

function Bloco({
  titulo,
  grupo,
  subtitulo,
  hrefMais,
  children,
}: {
  titulo: string;
  grupo: GrupoDespesa;
  subtitulo: string;
  hrefMais: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-track bg-surface-2 p-5 max-[760px]:p-4">
      <div className="text-[13px] font-medium text-muted">{titulo}</div>
      <div className="mb-0.5 mt-2 text-[26px] font-extrabold tracking-[-0.03em]">
        <Valor cents={grupo.totalCents} />
      </div>
      <div className="mt-1.5 text-[13px] text-faint">{subtitulo}</div>
      <Barra fina percent={grupo.pagoPercent} className="mt-3.5" />
      <div className="mb-2 mt-2.5 flex justify-between text-[13px] text-muted">
        <span>
          <b className="text-fg">R$ {formatarNumeroBRL(grupo.pagoCents)}</b> pago de R${' '}
          {formatarNumeroBRL(grupo.totalCents)}
        </span>
        <span>{Math.round(grupo.pagoPercent)}%</span>
      </div>
      {grupo.maiores.map((l) => (
        <div key={l.id} className="flex justify-between gap-2.5 border-t border-line-2 py-[9px] text-sm">
          <span className="text-fg-2">
            {l.nome}
            {l.rotulo ? <em className="ml-1 text-xs not-italic text-faint">{l.rotulo}</em> : null}
          </span>
          <b className="flex items-center gap-2 whitespace-nowrap font-bold">
            {l.pago ? <SeloPago /> : null}R$ {formatarNumeroBRL(l.valorCents)}
          </b>
        </div>
      ))}
      {grupo.restantes > 0 ? (
        <Link href={hrefMais} className="block border-t border-line-2 pt-2.5 text-[13px] font-semibold text-accent no-underline">
          +{grupo.restantes} outras →
        </Link>
      ) : null}
      {children}
    </div>
  );
}

export function DespesasMesCard({ despesas }: { despesas: Despesas }) {
  const { fixo, parcelado } = despesas;
  const termina = parcelado.terminamEsteMes;
  return (
    <Card>
      <div className="flex items-end justify-between gap-6 max-[760px]:flex-col max-[760px]:items-stretch">
        <div>
          <div className="text-[13px] font-medium text-muted">Despesas do mês</div>
          <div className="mb-0.5 mt-2 text-[32px] font-extrabold tracking-[-0.03em]">
            <Valor cents={despesas.totalCents} sufixo="total de despesas" />
          </div>
          <div className="mt-1.5 text-[13px] text-faint">
            R$ {formatarNumeroBRL(despesas.pagoCents)} pago · R$ {formatarNumeroBRL(despesas.aPagarCents)} a pagar
          </div>
        </div>
        <div className="w-[380px] max-[760px]:w-auto">
          <div className="flex h-2.5 gap-[3px] overflow-hidden rounded-full">
            {despesas.fixoPercent > 0 ? (
              <i className="block rounded-full bg-accent" style={{ width: `${despesas.fixoPercent}%` }} />
            ) : null}
            {despesas.parceladoPercent > 0 ? (
              <i className="block rounded-full bg-accent-light" style={{ width: `${despesas.parceladoPercent}%` }} />
            ) : null}
          </div>
          <div className="mt-2.5 flex gap-4 text-xs text-muted">
            <span>
              <s className="mr-1.5 inline-block size-2 rounded-[3px] bg-accent" />
              Fixo {Math.round(despesas.fixoPercent)}%
            </span>
            <span>
              <s className="mr-1.5 inline-block size-2 rounded-[3px] bg-accent-light" />
              Parcelado {Math.round(despesas.parceladoPercent)}%
            </span>
          </div>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-4 max-[760px]:grid-cols-1">
        <Bloco
          titulo="Custo fixo"
          grupo={fixo}
          subtitulo={`${fixo.qtd} ${fixo.qtd === 1 ? 'conta' : 'contas'} · ${fixo.qtdPagas} ${fixo.qtdPagas === 1 ? 'paga' : 'pagas'}`}
          hrefMais="/custos/fixos"
        />
        <Bloco
          titulo="Parcelado"
          grupo={parcelado}
          subtitulo={`${parcelado.qtd} ${parcelado.qtd === 1 ? 'parcela' : 'parcelas'} · ${parcelado.qtdPagas} ${parcelado.qtdPagas === 1 ? 'paga' : 'pagas'}`}
          hrefMais="/custos/parcelados"
        >
          {termina ? (
            <div className="mt-3 inline-block rounded-full bg-accent-chip px-3 py-1.5 text-xs font-semibold text-accent">
              {termina.qtd} {termina.qtd === 1 ? 'termina' : 'terminam'} este mês · −R$ {formatarNumeroBRL(termina.valorCents)} em {termina.mesSeguinte}
            </div>
          ) : null}
        </Bloco>
      </div>
    </Card>
  );
}
