'use client';

/**
 * Formulário de novo snapshot (SPEC 5.6, 8): pré-preenchido com
 * `sugestaoItensSnapshot` (itens do último snapshot, ou saldos das contas
 * que entram no patrimônio quando não há histórico).
 */
import { useCallback, useMemo, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select } from '@/components/ui';
import { formatBRL, parseBRL } from '@/shared/dinheiro';
import { criarSnapshot } from '@/actions/config';
import type { ClassePatrimonio } from '@/domain/model/enums';
import type { ItemSnapshotInput } from '@/application/patrimonio';
import { CLASSE_LABEL, CLASSES_PATRIMONIO } from './classe-patrimonio';

interface LinhaItem {
  id: string;
  nome: string;
  classe: ClassePatrimonio;
  valorTexto: string;
}

function novoId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `linha-${Math.random().toString(36).slice(2)}`;
}

function centavosParaTexto(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function linhaVazia(): LinhaItem {
  return { id: novoId(), nome: '', classe: 'CONTA', valorTexto: '' };
}

function linhasIniciais(itens: ItemSnapshotInput[]): LinhaItem[] {
  if (itens.length === 0) return [linhaVazia()];
  return itens.map((i) => ({
    id: novoId(),
    nome: i.nome,
    classe: i.classe,
    valorTexto: centavosParaTexto(i.valorCents),
  }));
}

export function NovoSnapshotForm({
  itensSugeridos,
  hojeISO,
}: {
  itensSugeridos: ItemSnapshotInput[];
  hojeISO: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<string>(hojeISO);
  const [linhas, setLinhas] = useState<LinhaItem[]>(() => linhasIniciais(itensSugeridos));
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  const atualizarLinha = useCallback((id: string, patch: Partial<Omit<LinhaItem, 'id'>>) => {
    setSucesso(false);
    setLinhas((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, []);

  const adicionarLinha = useCallback(() => {
    setLinhas((prev) => [...prev, linhaVazia()]);
  }, []);

  const removerLinha = useCallback((id: string) => {
    setLinhas((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev));
  }, []);

  const totalPreviewCents = useMemo(() => {
    return linhas.reduce((soma, l) => {
      if (l.nome.trim() === '' || l.valorTexto.trim() === '') return soma;
      try {
        return soma + parseBRL(l.valorTexto);
      } catch {
        return soma;
      }
    }, 0);
  }, [linhas]);

  const enviar = useCallback(
    (evento: FormEvent<HTMLFormElement>) => {
      evento.preventDefault();
      setErro(null);
      setSucesso(false);

      const preenchidas = linhas.filter((l) => l.nome.trim() !== '');
      if (preenchidas.length === 0) {
        setErro('Adicione ao menos um item com nome.');
        return;
      }

      let itens: { nome: string; classe: ClassePatrimonio; valorCents: number }[];
      try {
        itens = preenchidas.map((l) => ({
          nome: l.nome.trim(),
          classe: l.classe,
          valorCents: parseBRL(l.valorTexto.trim() === '' ? '0' : l.valorTexto),
        }));
      } catch {
        setErro('Verifique os valores digitados — use o formato 1.234,56.');
        return;
      }

      startTransition(async () => {
        const r = await criarSnapshot({ data, itens });
        if (r.ok) {
          setSucesso(true);
          router.refresh();
        } else {
          setErro(r.erro);
        }
      });
    },
    [linhas, data, router],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Novo snapshot</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={enviar} className="space-y-4">
          <div>
            <Label htmlFor="snapshot-data">Data</Label>
            <Input
              id="snapshot-data"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              required
            />
          </div>

          <div className="space-y-3">
            {linhas.map((linha, idx) => (
              <div key={linha.id} className="rounded-xl border border-border bg-surface-2 p-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor={`item-nome-${linha.id}`} className="mb-0">
                    Item {idx + 1}
                  </Label>
                  <button
                    type="button"
                    onClick={() => removerLinha(linha.id)}
                    disabled={linhas.length <= 1}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center text-faint transition-colors hover:text-negativo disabled:pointer-events-none disabled:opacity-30"
                    aria-label={`Remover item ${idx + 1}`}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <Input
                    id={`item-nome-${linha.id}`}
                    placeholder="Nome (ex.: Conta corrente)"
                    value={linha.nome}
                    onChange={(e) => atualizarLinha(linha.id, { nome: e.target.value })}
                  />
                  <Select
                    aria-label={`Classe do item ${idx + 1}`}
                    value={linha.classe}
                    onChange={(e) =>
                      atualizarLinha(linha.id, { classe: e.target.value as ClassePatrimonio })
                    }
                    className="sm:w-44"
                  >
                    {CLASSES_PATRIMONIO.map((c) => (
                      <option key={c} value={c}>
                        {CLASSE_LABEL[c]}
                      </option>
                    ))}
                  </Select>
                  <Input
                    inputMode="decimal"
                    placeholder="0,00"
                    aria-label={`Valor do item ${idx + 1}`}
                    value={linha.valorTexto}
                    onChange={(e) => atualizarLinha(linha.id, { valorTexto: e.target.value })}
                    className="tnum sm:w-32"
                  />
                </div>
              </div>
            ))}
          </div>

          <Button type="button" variant="outline" size="sm" onClick={adicionarLinha}>
            <Plus size={16} /> Adicionar item
          </Button>

          <div className="flex items-center justify-between border-t border-border pt-3">
            <p className="text-sm text-muted">
              Total:{' '}
              <span className="tnum font-medium text-fg">{formatBRL(totalPreviewCents)}</span>
            </p>
          </div>

          {erro ? <p className="text-sm text-negativo">{erro}</p> : null}
          {sucesso ? <p className="text-sm text-positivo">Snapshot salvo.</p> : null}

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Salvando…' : 'Salvar snapshot'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
