import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { criarDeps } from '@/composition';
import { obterEstadoHoje } from '@/application/hoje';
import { obterEstadoConfig } from '@/application/config';
import { obterEstadoHome } from '@/application/home';
import { RecuperacaoCard } from '@/components/hoje/recuperacao-card';
import { HomeHeader } from '@/components/dashboard/home-header';
import { HeroHoje } from '@/components/dashboard/hero-hoje';
import { LancamentoPainel } from '@/components/dashboard/lancamento-painel';
import { LancamentoTexto } from '@/components/dashboard/lancamento-texto';
import { ExtrasCard } from '@/components/dashboard/extras-card';
import { MetaPoupancaCard } from '@/components/dashboard/meta-poupanca-card';
import { ReservaCard } from '@/components/dashboard/reserva-card';
import { DespesasMesCard } from '@/components/dashboard/despesas-mes-card';
import { ProximosDiasCard } from '@/components/dashboard/proximos-dias-card';
import { VerbaLivreCard } from '@/components/dashboard/verba-livre-card';

export const dynamic = 'force-dynamic';

export default async function HojePage() {
  const deps = await criarDeps();
  const { config } = await obterEstadoConfig(deps);

  // Onboarding: sem renda configurada, o número não faz sentido.
  if (config.rendaBaseCents <= 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <p className="text-lg font-medium text-fg">Vamos configurar sua renda</p>
        <p className="mt-2 max-w-xs text-sm text-muted">
          O app calcula quanto você pode gastar por dia a partir da sua renda, gastos fixos e
          meta de poupança. Só leva um minuto.
        </p>
        <Link
          href="/config"
          className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-accent px-5 font-medium text-accent-fg"
        >
          Configurar agora <ArrowRight size={18} />
        </Link>
      </div>
    );
  }

  const [home, hoje] = await Promise.all([obterEstadoHome(deps), obterEstadoHoje(deps)]);
  const { recuperacao } = hoje;
  const grid = (cols: 2 | 3) =>
    `grid gap-4 max-[760px]:grid-cols-1 ${cols === 3 ? 'grid-cols-3' : 'grid-cols-2'}`;

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4">
      <HomeHeader {...home.cabecalho} />

      {hoje.pendenciaFechamento ? (
        <Link
          href="/fechar-ciclo"
          className="flex items-center gap-2 rounded-[20px] border border-atencao/40 bg-atencao/10 px-4 py-3 text-sm text-atencao"
        >
          <AlertTriangle size={16} />
          Ciclo anterior aberto — toque para fechar quando puder.
        </Link>
      ) : null}

      {recuperacao.emRecuperacao ? (
        <RecuperacaoCard
          deficitCents={recuperacao.deficitCents}
          diasSemGastar={recuperacao.gastoZero.diasSemGastar}
          puxarCents={recuperacao.puxarDaReserva.valorCents}
        />
      ) : (
        <HeroHoje hero={home.hero} />
      )}

      <LancamentoTexto categorias={home.categoriasLancamento} />

      {/* Modal "Lançar gasto" (botão da sidebar / atalho N); não renderiza nada visível. */}
      <LancamentoPainel hoje={hoje.hoje} categorias={home.categoriasLancamento} />

      <div className={grid(3)}>
        <ExtrasCard extras={home.extras} />
        <MetaPoupancaCard meta={home.metaPoupanca} />
        <ReservaCard reserva={home.reserva} />
      </div>

      <DespesasMesCard despesas={home.despesas} />

      <div className={grid(2)}>
        <ProximosDiasCard proximos7Dias={home.proximos7Dias} />
        <VerbaLivreCard verbaLivre={home.verbaLivre} />
      </div>
    </div>
  );
}
