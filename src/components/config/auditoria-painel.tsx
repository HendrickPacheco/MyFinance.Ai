'use client';

/**
 * Lista paginada da trilha de auditoria do agente (tela `/config/auditoria`).
 * Mesmo padrão de `GerenciarMemoria`: estado seedado pelo servidor
 * (`paginaInicial`), filtros disparam `listarAuditoriaAction` via
 * `startTransition`, "carregar mais" soma à lista em vez de substituir.
 *
 * `comFmt` (kernel da API do agente) é reaproveitado aqui para o
 * antes/depois exibido ter o MESMO par `<campo>Cents` / `<campo>Fmt` que o
 * agente externo recebeu — nenhuma formatação de dinheiro própria nasce
 * nesta tela.
 */
import { useId, useState, useTransition } from 'react';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { Badge, Button, Card, CardContent, Checkbox, EmptyState, Input, Label, Select } from '@/components/ui';
import { comFmt } from '@/agent-api';
import { listarAuditoriaAction } from '@/actions/auditoria';
import type { AcaoAuditoriaAgente, PaginaAuditoriaAgente, RegistroAuditoriaAgente } from '@/domain/ports/auditoria';

const ROTULO_ACAO: Record<AcaoAuditoriaAgente, string> = {
  CREATE: 'Criou',
  UPDATE: 'Atualizou',
  DELETE: 'Excluiu',
  ACTION: 'Executou',
};

function formatarDataHora(data: Date | string): string {
  return new Date(data).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function BlocoJson({ titulo, valor }: { titulo: string; valor: unknown }) {
  if (valor == null) return null;
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-faint">{titulo}</p>
      <pre className="mt-1 overflow-x-auto rounded-lg bg-surface-2 p-3 text-xs text-fg">
        {JSON.stringify(comFmt(valor), null, 2)}
      </pre>
    </div>
  );
}

function LinhaAuditoria({ registro }: { registro: RegistroAuditoriaAgente }) {
  const [aberto, setAberto] = useState(false);
  const temDetalhe = registro.antes != null || registro.depois != null;

  return (
    <div className="border-b border-border py-3 last:border-0">
      <button
        type="button"
        onClick={() => temDetalhe && setAberto((v) => !v)}
        className="flex w-full items-start justify-between gap-3 text-left"
        disabled={!temDetalhe}
      >
        <div className="flex items-start gap-2">
          {temDetalhe ? (
            aberto ? (
              <ChevronDown size={16} className="mt-0.5 shrink-0 text-faint" />
            ) : (
              <ChevronRight size={16} className="mt-0.5 shrink-0 text-faint" />
            )
          ) : (
            <span className="w-4" />
          )}
          <div>
            <p className="text-sm text-fg">
              {ROTULO_ACAO[registro.acao]} <span className="font-medium">{registro.entidade}</span>
              {registro.entidadeId ? <span className="tnum text-muted"> #{registro.entidadeId}</span> : null}
            </p>
            <p className="tnum text-xs text-faint">
              {formatarDataHora(registro.criadoEm)} · {registro.metodo} {registro.rota}
            </p>
          </div>
        </div>
        {registro.dryRun ? <Badge tone="atencao">dryRun</Badge> : null}
      </button>

      {aberto ? (
        <div className="mt-3 ml-6 space-y-2">
          <BlocoJson titulo="Antes" valor={registro.antes} />
          <BlocoJson titulo="Depois" valor={registro.depois} />
        </div>
      ) : null}
    </div>
  );
}

interface Filtro {
  entidade: string;
  acao: AcaoAuditoriaAgente | '';
  incluirDryRun: boolean;
}

const FILTRO_VAZIO: Filtro = { entidade: '', acao: '', incluirDryRun: false };

export function AuditoriaPainel({ paginaInicial }: { paginaInicial: PaginaAuditoriaAgente }) {
  const idBase = useId();
  const [filtro, setFiltro] = useState<Filtro>(FILTRO_VAZIO);
  const [pagina, setPagina] = useState(paginaInicial);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const buscar = (filtroAtual: Filtro, cursor?: string) => {
    setErro(null);
    startTransition(async () => {
      const r = await listarAuditoriaAction({
        entidade: filtroAtual.entidade.trim() || undefined,
        acao: filtroAtual.acao || undefined,
        incluirDryRun: filtroAtual.incluirDryRun,
        cursor,
        limite: 50,
      });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setPagina((atual) =>
        cursor ? { itens: [...atual.itens, ...r.data.itens], proximoCursor: r.data.proximoCursor } : r.data,
      );
    });
  };

  const aplicarFiltro = (novo: Filtro) => {
    setFiltro(novo);
    buscar(novo);
  };

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px]">
            <Label htmlFor={`${idBase}-entidade`}>Entidade</Label>
            <Input
              id={`${idBase}-entidade`}
              placeholder="Ex.: Transacao"
              value={filtro.entidade}
              onChange={(e) => aplicarFiltro({ ...filtro, entidade: e.target.value })}
            />
          </div>

          <div className="min-w-[160px]">
            <Label htmlFor={`${idBase}-acao`}>Ação</Label>
            <Select
              id={`${idBase}-acao`}
              value={filtro.acao}
              onChange={(e) => aplicarFiltro({ ...filtro, acao: e.target.value as Filtro['acao'] })}
            >
              <option value="">Todas</option>
              {Object.entries(ROTULO_ACAO).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </Select>
          </div>

          <label className="flex items-center gap-2 pb-2.5 text-sm text-fg">
            <Checkbox
              checked={filtro.incluirDryRun}
              onChange={(e) => aplicarFiltro({ ...filtro, incluirDryRun: e.target.checked })}
            />
            Incluir simulações (dryRun)
          </label>

          <Button variant="ghost" size="sm" onClick={() => buscar(filtro)} disabled={pending}>
            <RefreshCw size={14} /> Atualizar
          </Button>
        </div>

        {erro ? <p className="text-sm text-negativo">{erro}</p> : null}

        {pagina.itens.length === 0 ? (
          <EmptyState
            titulo="Nenhum registro"
            descricao="Nenhuma escrita do agente bateu com esse filtro ainda."
          />
        ) : (
          <div>
            {pagina.itens.map((registro) => (
              <LinhaAuditoria key={registro.id} registro={registro} />
            ))}
          </div>
        )}

        {pagina.proximoCursor ? (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => buscar(filtro, pagina.proximoCursor ?? undefined)}
          >
            {pending ? 'Carregando…' : 'Carregar mais'}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
