'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  Badge,
} from '@/components/ui';
import { formatBRL, parseBRL } from '@/shared/dinheiro';
import { upsertConta, upsertCategoria } from '@/actions/config';
import type { Conta, Categoria } from '@/domain/model/entidades';

function useSalvar() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const salvar = (fn: () => Promise<{ ok: boolean; erro?: string }>, onOk: () => void) => {
    setErro(null);
    startTransition(async () => {
      try {
        const r = await fn();
        if (r.ok) {
          onOk();
          router.refresh();
        } else setErro(r.erro ?? 'Erro.');
      } catch {
        setErro('Confira os valores.');
      }
    });
  };
  return { pending, erro, salvar };
}

/* ------------------------------------------------------------------ Contas */
export function ListaContas({ contas }: { contas: Conta[] }) {
  const { pending, erro, salvar } = useSalvar();
  const [edit, setEdit] = useState<Conta | null>(null);
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<Conta['tipo']>('RESERVA');
  const [saldo, setSaldo] = useState('R$ 0,00');

  const abrir = (c?: Conta) => {
    setEdit(c ?? null);
    setNome(c?.nome ?? '');
    setTipo(c?.tipo ?? 'RESERVA');
    setSaldo(formatBRL(c?.saldoCents ?? 0));
  };

  const enviar = () =>
    salvar(
      () =>
        upsertConta({
          id: edit?.id ?? '',
          nome,
          tipo,
          saldoCents: parseBRL(saldo),
          incluiPatrimonio: edit?.incluiPatrimonio ?? true,
          arquivada: edit?.arquivada ?? false,
        }),
      () => {
        setEdit(null);
        setNome('');
        setSaldo('R$ 0,00');
      },
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contas / buckets</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="divide-y divide-border">
          {contas.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-fg">{c.nome}</p>
                <p className="text-xs text-faint">{c.tipo}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="tnum text-sm text-muted">{formatBRL(c.saldoCents)}</span>
                <button onClick={() => abrir(c)} className="text-faint hover:text-fg" aria-label="Editar">
                  <Pencil size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="rounded-xl border border-border-strong p-3">
          <p className="mb-2 text-sm text-muted">{edit ? `Editando: ${edit.nome}` : 'Nova conta'}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Input placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            <Select value={tipo} onChange={(e) => setTipo(e.target.value as Conta['tipo'])}>
              <option value="FIXOS">Fixos</option>
              <option value="VARIAVEL">Variável</option>
              <option value="RESERVA">Reserva</option>
              <option value="INVESTIMENTO">Investimento</option>
            </Select>
            <Input
              inputMode="decimal"
              value={saldo}
              onChange={(e) => setSaldo(e.target.value)}
              onFocus={(e) => e.target.select()}
            />
          </div>
          {erro ? <p className="mt-2 text-sm text-negativo">{erro}</p> : null}
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={enviar} disabled={pending || !nome}>
              <Plus size={16} /> {edit ? 'Salvar' : 'Adicionar'}
            </Button>
            {edit ? (
              <Button size="sm" variant="ghost" onClick={() => abrir()}>
                Cancelar
              </Button>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------- Categorias */
export function ListaCategorias({ categorias }: { categorias: Categoria[] }) {
  const { pending, erro, salvar } = useSalvar();
  const [nome, setNome] = useState('');
  const [grupo, setGrupo] = useState<Categoria['grupo']>('VARIAVEL');
  const [essencial, setEssencial] = useState(false);

  const enviar = () =>
    salvar(
      () =>
        upsertCategoria({
          id: '',
          nome,
          grupo,
          essencial,
          icone: null,
          cor: null,
          ordem: categorias.length + 1,
        }),
      () => {
        setNome('');
        setEssencial(false);
      },
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Categorias</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {categorias.map((c) => (
            <Badge key={c.id} tone={c.essencial ? 'positivo' : 'neutral'}>
              {c.nome}
            </Badge>
          ))}
        </div>

        <div className="rounded-xl border border-border-strong p-3">
          <p className="mb-2 text-sm text-muted">Nova categoria</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Input placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            <Select value={grupo} onChange={(e) => setGrupo(e.target.value as Categoria['grupo'])}>
              <option value="VARIAVEL">Variável</option>
              <option value="FIXO">Fixo</option>
              <option value="RENDA">Renda</option>
            </Select>
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={essencial}
                onChange={(e) => setEssencial(e.target.checked)}
                className="h-5 w-5 accent-[var(--color-accent)]"
              />
              Essencial
            </label>
          </div>
          {erro ? <p className="mt-2 text-sm text-negativo">{erro}</p> : null}
          <Button size="sm" className="mt-2" onClick={enviar} disabled={pending || !nome}>
            <Plus size={16} /> Adicionar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
