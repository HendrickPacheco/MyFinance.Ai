'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { Button, Input, Label, Select } from '@/components/ui';
import { CampoDinheiro } from './campo-dinheiro';
import type { CustoFixo } from '@/domain/model/entidades';

export interface RascunhoCustoFixo {
  nome: string;
  valorCents: number;
  diaVencimento: number;
  vigenteDe: string | null;
  vigenteAte: string | null;
}

export interface FixoFormProps {
  /** `null` = criando. Preenchido = editando aquele custo. */
  editando: CustoFixo | null;
  pendente: boolean;
  erro: string | null;
  onSubmit: (rascunho: RascunhoCustoFixo) => void;
  onCancelar: () => void;
}

const DIAS = Array.from({ length: 31 }, (_, i) => i + 1);

/**
 * Formulário compartilhado ABAIXO da lista, com rótulo `Editando: {nome}` —
 * o padrão que já existe em `gerenciadores.tsx` (§3.3). Modal seria pior aqui:
 * são poucos campos e o cadastro em lote é comum, então cada abertura de modal
 * viraria dois cliques a mais por custo.
 *
 * Todo campo monetário usa o acumulador de centavos (`CampoDinheiro`), nunca
 * texto livre reparseado (§5, débito 4).
 */
export function FixoForm({ editando, pendente, erro, onSubmit, onCancelar }: FixoFormProps) {
  const [nome, setNome] = React.useState('');
  const [valorCents, setValorCents] = React.useState(0);
  const [dia, setDia] = React.useState(5);
  const [vigenteDe, setVigenteDe] = React.useState('');
  const [vigenteAte, setVigenteAte] = React.useState('');
  const nomeRef = React.useRef<HTMLInputElement>(null);
  const idErro = React.useId();
  const idHintVigencia = React.useId();

  // Trocar o alvo de edição repovoa o formulário e leva o foco para ele — sem
  // isso, clicar em "Editar" numa linha lá em cima rolaria a tela e deixaria o
  // usuário de teclado sem saber onde o formulário apareceu.
  React.useEffect(() => {
    setNome(editando?.nome ?? '');
    setValorCents(editando?.valorCents ?? 0);
    setDia(editando?.diaVencimento ?? 5);
    setVigenteDe(editando?.vigenteDe ?? '');
    setVigenteAte(editando?.vigenteAte ?? '');
    if (editando) nomeRef.current?.focus();
  }, [editando]);

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      nome,
      valorCents,
      diaVencimento: dia,
      // String vazia do `<input type="date">` significa "sem vigência", que no
      // domínio é `null` — nunca "" (que não é data civil válida).
      vigenteDe: vigenteDe === '' ? null : vigenteDe,
      vigenteAte: vigenteAte === '' ? null : vigenteAte,
    });
  };

  return (
    <form onSubmit={enviar} className="rounded-xl border border-border-strong p-3">
      <p className="mb-3 text-sm text-muted">
        {editando ? `Editando: ${editando.nome}` : 'Novo custo fixo'}
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="fixo-nome">Nome</Label>
          <Input
            ref={nomeRef}
            id="fixo-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Academia"
            aria-describedby={erro ? idErro : undefined}
          />
        </div>
        <div>
          <Label htmlFor="fixo-valor">Valor por mês</Label>
          <CampoDinheiro id="fixo-valor" valorCents={valorCents} onChange={setValorCents} />
        </div>
        <div>
          <Label htmlFor="fixo-dia">Dia de vencimento</Label>
          <Select id="fixo-dia" value={dia} onChange={(e) => setDia(Number(e.target.value))}>
            {DIAS.map((d) => (
              <option key={d} value={d}>
                dia {d}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="fixo-vigente-de">Começa em (opcional)</Label>
          <Input
            id="fixo-vigente-de"
            type="date"
            value={vigenteDe}
            onChange={(e) => setVigenteDe(e.target.value)}
            aria-describedby={idHintVigencia}
          />
        </div>
        <div>
          <Label htmlFor="fixo-vigente-ate">Termina em (opcional)</Label>
          <Input
            id="fixo-vigente-ate"
            type="date"
            value={vigenteAte}
            onChange={(e) => setVigenteAte(e.target.value)}
            aria-describedby={idHintVigencia}
          />
        </div>
      </div>
      <p id={idHintVigencia} className="mt-2 text-xs text-faint">
        A vigência só orienta a <strong>projeção dos próximos meses</strong> — é assim que a verba
        &quot;respira&quot; quando um custo acaba. Ciclo que já nasceu não muda: ele guarda o valor
        de fixos que foi congelado nele. Deixe em branco para um custo constante.
      </p>

      {erro ? (
        <p id={idErro} role="alert" className="mt-2 text-sm text-negativo">
          {erro}
        </p>
      ) : null}

      <div className="mt-3 flex gap-2">
        <Button size="sm" type="submit" disabled={pendente || nome.trim() === ''}>
          <Plus size={16} aria-hidden /> {editando ? 'Salvar' : 'Adicionar'}
        </Button>
        {editando ? (
          <Button size="sm" type="button" variant="ghost" onClick={onCancelar}>
            Cancelar edição
          </Button>
        ) : null}
      </div>
    </form>
  );
}
