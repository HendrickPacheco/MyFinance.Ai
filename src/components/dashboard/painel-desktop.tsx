/**
 * Composição do painel desktop (>=1024px). Server Component puro — recebe o
 * `EstadoPainel` já pronto e só arruma layout; nenhum cálculo mora aqui
 * (regra 4). Blocos de dinheiro comprometido (fixos/provisão) ficam sempre
 * visualmente separados da verba variável (regra 5).
 */
import { KpiFaixa } from './kpi-faixa';
import { LancamentoPainel } from './lancamento-painel';
import { ParcelamentoModal } from './parcelamento-modal';
import { ExtratoVariaveis } from '@/components/transacoes/extrato-variaveis';
import { CategoriasPizza } from './categorias-pizza';
import { MetodosPagamento } from './metodos-pagamento';
import { ComprometidoLista } from './comprometido-lista';
import { ParceladosLista } from './parcelados-lista';
import { PatrimonioPainel } from './patrimonio-painel';
import { MetasPainel } from './metas-painel';
import { PendenciaAlerta } from './pendencia-alerta';
import type { EstadoPainel } from '@/application/dashboard-tipos';

export function PainelDesktop({ estado }: { estado: EstadoPainel }) {
  return (
    <div className="space-y-6">
      <PendenciaAlerta pendencia={estado.pendenciaFechamento} />

      <div className="flex items-baseline justify-between">
        <p className="text-sm text-muted">Ciclo atual · {estado.periodoLabel}</p>
      </div>

      <KpiFaixa kpis={estado.kpis} />

      {/* `LancamentoPainel` não renderiza nada visível na página — é o modal
          de "Lançar gasto" (aberto pelo botão da sidebar ou pelo atalho "N").
          Fica montado aqui porque é aqui que `hoje`/`categoriasLancamento`
          existem; a página continua só leitura enquanto o modal está fechado. */}
      <LancamentoPainel hoje={estado.hoje} categorias={estado.categoriasLancamento} />

      {/* Mesmo raciocínio do `LancamentoPainel` acima: o modal não renderiza
          nada visível — é "Nova compra parcelada", aberto pelo botão do card
          `ParceladosLista` (Server Component, então a abertura viaja por
          evento de `window`, ver `EVENTO_ABRIR_PARCELAMENTO`). */}
      <ParcelamentoModal hoje={estado.hoje} categorias={estado.categoriasLancamento} />

      <ExtratoVariaveis
        escopo="ciclo"
        transacoes={estado.transacoesVariaveis}
        totalCents={estado.transacoesVariaveisTotalCents}
        programadasCents={estado.transacoesVariaveisProgramadasCents}
        categoriasLancamento={estado.categoriasLancamento}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CategoriasPizza categorias={estado.categorias} />
        <MetodosPagamento metodos={estado.metodos} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ComprometidoLista
          custosFixos={estado.custosFixos}
          fixosTotalCents={estado.fixosTotalCents}
          provisoes={estado.provisoes}
          provisaoMensalTotalCents={estado.provisaoMensalTotalCents}
        />
        <ParceladosLista
          parcelados={estado.parcelados}
          parceladosTotalCents={estado.parceladosTotalCents}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PatrimonioPainel patrimonio={estado.patrimonio} />
        <MetasPainel metas={estado.metas} />
      </div>
    </div>
  );
}
