import Link from 'next/link';
import { Database, RefreshCw } from 'lucide-react';
import { criarDeps } from '@/composition';
import { obterEstadoConfig } from '@/application/config';
import { formatBRL } from '@/shared/dinheiro';
import { verbaVariavelCents, poupancaAlvoCents } from '@/domain/finance';
import { ConfigGeral } from '@/components/config/config-geral';
import {
  ListaContas,
  ListaCustos,
  ListaProvisoes,
  ListaCategorias,
} from '@/components/config/gerenciadores';
import { RecalcularCiclo } from '@/components/config/recalcular-ciclo';

import { SomenteDono } from '@/components/auth/somente-dono';

export const dynamic = 'force-dynamic';

async function ConfigPageConteudo() {
  const deps = await criarDeps();
  const estado = await obterEstadoConfig(deps);
  const { config, fixosTotalCents, provisaoMensalCents } = estado;

  const poupanca = poupancaAlvoCents({
    rendaPrevistaCents: config.rendaBaseCents,
    metaPoupancaCents: config.metaPoupancaCents,
    metaPoupancaPercent: config.metaPoupancaPercent,
  });
  const verbaPrevista = verbaVariavelCents({
    rendaPrevistaCents: config.rendaBaseCents,
    poupancaAlvoCents: poupanca,
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

      {/* Prévia da verba (a partir dos parâmetros atuais) */}
      {config.rendaBaseCents > 0 ? (
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
          <p className="text-sm text-muted">Verba variável prevista para o próximo ciclo</p>
          <p className="tnum mt-1 text-3xl font-bold text-fg">{formatBRL(verbaPrevista)}</p>
          <p className="tnum mt-2 text-xs text-faint">
            renda {formatBRL(config.rendaBaseCents)} − poupança {formatBRL(poupanca)} − fixos{' '}
            {formatBRL(fixosTotalCents)} − provisão {formatBRL(provisaoMensalCents)}
          </p>
          {verbaPrevista <= 0 ? (
            <p className="mt-2 text-sm text-negativo">
              A verba ficou zerada ou negativa. Reveja a meta de poupança ou os custos fixos.
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
      />
      <ListaContas contas={estado.contas} />
      <ListaCustos custos={estado.custosFixos} />
      <ListaProvisoes provisoes={estado.provisoes} />
      <ListaCategorias categorias={estado.categorias} />

      <RecalcularCiclo />

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
