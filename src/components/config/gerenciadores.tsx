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
import { upsertConta, upsertCustoFixo, upsertProvisao, upsertCategoria } from '@/actions/config';
import type { Conta, CustoFixo, ProvisaoAnual, Categoria } from '@/domain/model/entidades';

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

/* ------------------------------------------------------------- Custos fixos */
export function ListaCustos({ custos }: { custos: CustoFixo[] }) {
  const { pending, erro, salvar } = useSalvar();
  const [edit, setEdit] = useState<CustoFixo | null>(null);
  const [nome, setNome] = useState('');
  const [valor, setValor] = useState('R$ 0,00');
  const [dia, setDia] = useState('5');

  const abrir = (c?: CustoFixo) => {
    setEdit(c ?? null);
    setNome(c?.nome ?? '');
    setValor(formatBRL(c?.valorCents ?? 0));
    setDia(String(c?.diaVencimento ?? 5));
  };

  const enviar = () =>
    salvar(
      () =>
        upsertCustoFixo({
          id: edit?.id ?? '',
          nome,
          valorCents: parseBRL(valor),
          diaVencimento: Number(dia),
          ativo: true,
          contaId: edit?.contaId ?? null,
        }),
      () => {
        setEdit(null);
        setNome('');
        setValor('R$ 0,00');
      },
    );

  const total = custos.reduce((s, c) => s + c.valorCents, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Custos fixos · {formatBRL(total)}/mês</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="divide-y divide-border">
          {custos.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-fg">{c.nome}</p>
                <p className="text-xs text-faint">vence dia {c.diaVencimento}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="tnum text-sm text-muted">{formatBRL(c.valorCents)}</span>
                <button onClick={() => abrir(c)} className="text-faint hover:text-fg" aria-label="Editar">
                  <Pencil size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="rounded-xl border border-border-strong p-3">
          <p className="mb-2 text-sm text-muted">{edit ? `Editando: ${edit.nome}` : 'Novo custo fixo'}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Input placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            <Input
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onFocus={(e) => e.target.select()}
            />
            <Select value={dia} onChange={(e) => setDia(e.target.value)}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  dia {d}
                </option>
              ))}
            </Select>
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

/* --------------------------------------------------------------- Provisões */
export function ListaProvisoes({ provisoes }: { provisoes: ProvisaoAnual[] }) {
  const { pending, erro, salvar } = useSalvar();
  const [edit, setEdit] = useState<ProvisaoAnual | null>(null);
  const [nome, setNome] = useState('');
  const [valor, setValor] = useState('R$ 0,00');
  const [mes, setMes] = useState('');

  const abrir = (p?: ProvisaoAnual) => {
    setEdit(p ?? null);
    setNome(p?.nome ?? '');
    setValor(formatBRL(p?.valorAnualCents ?? 0));
    setMes(p?.mesEsperado ? String(p.mesEsperado) : '');
  };

  const enviar = () =>
    salvar(
      () =>
        upsertProvisao({
          id: edit?.id ?? '',
          nome,
          valorAnualCents: parseBRL(valor),
          mesEsperado: mes ? Number(mes) : null,
          acumuladoCents: edit?.acumuladoCents ?? 0,
          ativo: true,
        }),
      () => {
        setEdit(null);
        setNome('');
        setValor('R$ 0,00');
        setMes('');
      },
    );

  const totalAnual = provisoes.reduce((s, p) => s + p.valorAnualCents, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Provisões anuais · {formatBRL(Math.floor(totalAnual / 12))}/mês</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted">
          Custos que não caem todo mês (IPVA, seguro, presentes). Somados no ano e divididos por 12
          viram custo mensal — a causa raiz do &quot;estourei sem motivo em dezembro&quot;.
        </p>
        <ul className="divide-y divide-border">
          {provisoes.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-fg">{p.nome}</p>
                <p className="tnum text-xs text-faint">
                  {formatBRL(p.valorAnualCents)}/ano · acumulado {formatBRL(p.acumuladoCents)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="tnum text-sm text-muted">{formatBRL(Math.floor(p.valorAnualCents / 12))}/mês</span>
                <button onClick={() => abrir(p)} className="text-faint hover:text-fg" aria-label="Editar">
                  <Pencil size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="rounded-xl border border-border-strong p-3">
          <p className="mb-2 text-sm text-muted">{edit ? `Editando: ${edit.nome}` : 'Nova provisão'}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Input placeholder="Nome (ex: IPVA)" value={nome} onChange={(e) => setNome(e.target.value)} />
            <Input
              inputMode="decimal"
              placeholder="Valor no ano"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onFocus={(e) => e.target.select()}
            />
            <Select value={mes} onChange={(e) => setMes(e.target.value)}>
              <option value="">mês (opcional)</option>
              {['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'].map(
                (m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ),
              )}
            </Select>
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
