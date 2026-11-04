import Link from 'next/link';
import { Database, KeyRound, ListChecks, Receipt, RefreshCw } from 'lucide-react';
import { criarDeps } from '@/composition';
import { obterEstadoConfig } from '@/application/config';
import { previaRecalculoCicloAtual } from '@/application/ciclos';
import { formatBRL } from '@/shared/dinheiro';
import { verbaVariavelCents, poupancaAlvoCents } from '@/domain/finance';
import { ConfigGeral } from '@/components/config/config-geral';
import { ListaContas, ListaCategorias } from '@/components/config/gerenciadores';
import { TemaToggle } from '@/components/layout/tema-toggle';
import { RecalcularCiclo } from '@/components/config/recalcular-ciclo';

import { SomenteDono } from '@/components/auth/somente-dono';

export const dynamic = 'force-dynamic';

async function ConfigPageConteudo() {
  const deps = await criarDeps();
  const [estado, previaRecalculo] = await Promise.all([
    obterEstadoConfig(deps),
    previaRecalculoCicloAtual(deps),
  ]);
  const { config, fixosTotalCents, provisaoMensalCents } = estado;

  const poupanca = poupancaAlvoCents({
    rendaPrevistaCents: config.rendaBaseCents,
    metaPoupancaCents: config.metaPoupancaCents,
    metaPoupancaPercent: config.metaPoupancaPercent,
  });
  const verbaPrevista = verbaVariavelCents({
    rendaPrevistaCents: config.rendaBaseCents,
    fixosCents: fixosTotalCents,
    provisaoMensalCents,
  });

  return (
    <div className="mx-auto w-full space-y-6 lg:max-w-3xl">
      <header>
        <h1 className="text-2xl font-semibold text-fg">Configuração</h1>
        <p className="mt-1 text-sm text-muted">
          Mudanças aqui valem para o <strong>próximo</strong> ciclo. O ciclo atual fica congelado.
        </p>
      </header>

      <div className="flex items-center justify-between rounded-[var(--radius-card)] border border-border bg-surface p-5">
        <p className="text-fg">Tema</p>
        <TemaToggle />
      </div>

      {/* Prévia da verba (a partir dos parâmetros atuais) */}
      {config.rendaBaseCents > 0 ? (
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
          <p className="text-sm text-muted">Verba variável prevista para o próximo ciclo</p>
          <p className="tnum mt-1 text-3xl font-bold text-fg">{formatBRL(verbaPrevista)}</p>
          <p className="tnum mt-2 text-xs text-faint">
            renda {formatBRL(config.rendaBaseCents)} − fixos {formatBRL(fixosTotalCents)} −
            provisão {formatBRL(provisaoMensalCents)}
          </p>
          <p className="tnum mt-1 text-xs text-faint">
            A meta de {formatBRL(poupanca)} está DENTRO dessa verba — ela é o alvo, não um
            desconto. Para bater a meta, gaste no máximo{' '}
            {formatBRL(Math.max(verbaPrevista - poupanca, 0))} no ciclo.
          </p>
          {verbaPrevista <= 0 ? (
            <p className="mt-2 text-sm text-negativo">
              A verba ficou zerada ou negativa. Reveja os custos fixos, as provisões ou a renda
              prevista.
            </p>
          ) : null}
        </div>
      ) : null}

      <ConfigGeral
        config={config}
        contas={estado.contas}
        avisoMetaIrreal={estado.avisoMetaIrreal}
        sugestaoRendaVariavelCents={estado.sugestaoRendaVariavelCents}
        sugestaoMetaPoupancaCents={estado.sugestaoMetaPoupancaCents}
        sugestaoMetaPorPoupancaReal={estado.sugestaoMetaPorPoupancaReal}
        rendaPrevistaUsd={estado.rendaPrevistaUsd}
        avisoCotacao={estado.avisoCotacao}
      />
      <ListaContas contas={estado.contas} />

      {/* O CRUD de custos fixos e provisões vive em /custos/fixos. Deixar uma
          segunda cópia dele aqui seria dois caminhos de escrita para o mesmo
          dado — fábrica de bug. Esta linha é a ponte, no padrão do card de
          Backup logo abaixo. */}
      <Link
        href="/custos/fixos"
        className="flex items-center justify-between rounded-[var(--radius-card)] border border-border bg-surface p-5 hover:border-border-strong"
      >
        <div className="flex items-center gap-3">
          <Receipt size={18} className="text-accent" aria-hidden />
          <div>
            <p className="text-fg">Custos fixos e provisões</p>
            <p className="tnum text-sm text-muted">
              Cadastrar, editar e desativar · {formatBRL(fixosTotalCents)} +{' '}
              {formatBRL(provisaoMensalCents)} por mês
            </p>
          </div>
        </div>
        <span className="text-faint" aria-hidden>
          →
        </span>
      </Link>

      <ListaCategorias categorias={estado.categorias} />

      <RecalcularCiclo previa={previaRecalculo} />

      <Link
        href="/config/backup"
        className="flex items-center justify-between rounded-[var(--radius-card)] border border-border bg-surface p-5 hover:border-border-strong"
      >
        <div className="flex items-center gap-3">
          <Database size={18} className="text-accent" />
          <div>
            <p className="text-fg">Backup e restauração</p>
            <p className="text-sm text-muted">Exportar / importar todos os dados em JSON</p>
          </div>
        </div>
        <span className="text-faint">→</span>
      </Link>

      <Link
        href="/config/tokens"
        className="flex items-center justify-between rounded-[var(--radius-card)] border border-border bg-surface p-5 hover:border-border-strong"
      >
        <div className="flex items-center gap-3">
          <KeyRound size={18} className="text-accent" />
          <div>
            <p className="text-fg">Tokens da API do agente</p>
            <p className="text-sm text-muted">Credenciais para um agente de IA externo ler e gravar dados</p>
          </div>
        </div>
        <span className="text-faint">→</span>
      </Link>

      <Link
        href="/config/auditoria"
        className="flex items-center justify-between rounded-[var(--radius-card)] border border-border bg-surface p-5 hover:border-border-strong"
      >
        <div className="flex items-center gap-3">
          <ListChecks size={18} className="text-accent" />
          <div>
            <p className="text-fg">Auditoria do agente</p>
            <p className="text-sm text-muted">O que o agente externo gravou em seu lugar</p>
          </div>
        </div>
        <span className="text-faint">→</span>
      </Link>

      <p className="flex items-center justify-center gap-1.5 pt-2 text-xs text-faint">
        <RefreshCw size={12} /> Dados salvos localmente no seu aparelho.
      </p>
    </div>
  );
}

/**
 * Tela de escrita: portão de papel (TASKS-AUTH S4.2). VIEWER vê um aviso
 * factual em vez do formulário. A trava real continua nos casos de uso.
 */
export default function ConfigPage() {
  return (
    <SomenteDono>
      <ConfigPageConteudo />
    </SomenteDono>
  );
}
