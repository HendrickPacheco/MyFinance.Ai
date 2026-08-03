import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { criarDeps } from '@/composition';
import { obterEstadoHoje } from '@/application/hoje';
import { obterEstadoConfig } from '@/application/config';
import { obterEstadoPainel } from '@/application/dashboard';
import { formatBRL } from '@/shared/dinheiro';
import { cn } from '@/lib/cn';
import { LancamentoRapido } from '@/components/hoje/lancamento-rapido';
import { RecuperacaoCard } from '@/components/hoje/recuperacao-card';
import { PainelDesktop } from '@/components/dashboard/painel-desktop';

export const dynamic = 'force-dynamic';

export default async function HojePage() {
  const deps = await criarDeps();
  const estado = await obterEstadoHoje(deps);
  const { config } = await obterEstadoConfig(deps);

  const rendaConfigurada = config.rendaBaseCents > 0;
  const { teto, recuperacao, ciclo } = estado;

  // Onboarding: sem renda configurada, o número não faz sentido. Vale tanto
  // para o painel desktop quanto para a tela Hoje mobile — sem duplicar.
  if (!rendaConfigurada) {
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

  const tone = escolherTom(teto.restaHojeCents, teto.tetoHojeCents, recuperacao.emRecuperacao);
  const estadoPainel = await obterEstadoPainel(deps);

  return (
    <div>
      {/* Desktop (>=1024px): painel completo. Mobile: tela Hoje preservada. */}
      <div className="hidden lg:block">
        <PainelDesktop estado={estadoPainel} />
      </div>

      <div className="lg:hidden">
        {estado.pendenciaFechamento ? (
          <Link
            href="/fechar-ciclo"
            className="mb-4 flex items-center gap-2 rounded-xl border border-atencao/40 bg-atencao/10 px-4 py-3 text-sm text-atencao"
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
          <section className="pt-6 text-center" aria-label="Quanto posso gastar hoje">
            <p className="text-sm uppercase tracking-widest text-muted">Posso gastar hoje</p>
            <p
              className={cn(
                'tnum mt-2 text-7xl font-bold leading-none tracking-tight sm:text-8xl',
                tone.cor,
              )}
            >
              {formatBRL(Math.max(teto.restaHojeCents, 0))}
            </p>
            <p className="mt-4 tnum text-sm text-muted">
              teto de hoje {formatBRL(teto.tetoHojeCents)} · gasto hoje{' '}
              {formatBRL(teto.gastoHojeCents)}
            </p>
            {tone.aviso ? <p className={cn('mt-2 text-sm', tone.cor)}>{tone.aviso}</p> : null}
          </section>
        )}

        <LancamentoRapido
          categorias={estado.categoriasRapidas.map((c) => ({ id: c.id, nome: c.nome, cor: c.cor }))}
        />

        {/* Rodapé discreto */}
        <div className="mt-8 flex items-center justify-center gap-2 text-sm text-faint">
          <span className="tnum">resta no ciclo {formatBRL(estado.restaNoCicloCents)}</span>
          <span>·</span>
          <span className="tnum">{teto.diasRestantes} dias</span>
        </div>
        <p className="mt-1 text-center text-xs text-faint">
          ciclo {formatarDataCurta(ciclo.dataInicio)} – {formatarDataCurta(ciclo.dataFim)}
        </p>
      </div>
    </div>
  );
}

function escolherTom(
  restaHoje: number,
  tetoHoje: number,
  emRecuperacao: boolean,
): { cor: string; aviso: string | null } {
  if (emRecuperacao) return { cor: 'text-recuperacao', aviso: null };
  if (restaHoje < 0) {
    return { cor: 'text-negativo', aviso: `Você passou ${formatBRL(-restaHoje)} do teto de hoje.` };
  }
  if (tetoHoje > 0 && restaHoje <= tetoHoje * 0.15) {
    return { cor: 'text-atencao', aviso: 'Quase no limite de hoje.' };
  }
  return { cor: 'text-positivo', aviso: null };
}

function formatarDataCurta(data: string): string {
  const [, mes, dia] = data.split('-');
  return `${dia}/${mes}`;
}
