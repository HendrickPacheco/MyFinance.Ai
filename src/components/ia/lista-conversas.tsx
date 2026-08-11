'use client';

/**
 * Lista de conversas anteriores do copiloto (Fase 3, painel de sessões).
 *
 * DESKTOP APENAS (≥1024px) — quem monta esta coluna (`CopilotoPainel`) já a
 * esconde em telas menores com `hidden lg:flex`. Este componente não sabe
 * disso e não precisa saber; ele só renderiza a lista quando existe espaço.
 *
 * Puramente apresentacional: recebe os dados e os handlers, não busca nada
 * sozinho — quem faz `listarConversasIA`/`abrirConversaIA` é `CopilotoPainel`.
 */
import * as React from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button, ConfirmInline, EmptyState, Input } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { Conversa } from '@/domain/model/entidades';

/**
 * Rótulo curto de quando a conversa foi atualizada. `atualizadaEm` é um
 * `Date` de verdade (CLAUDE.md regra 2 permite `DateTime` para isto — não é
 * data civil de regra de negócio, é o timestamp real da linha), então
 * comparar com `new Date()` aqui é seguro: isto só roda no cliente, depois do
 * mount, nunca durante SSR — não há hidratação para quebrar.
 */
function formatarQuando(data: Date): string {
  const agora = new Date();
  const mesmoDia =
    data.getFullYear() === agora.getFullYear() &&
    data.getMonth() === agora.getMonth() &&
    data.getDate() === agora.getDate();

  return mesmoDia
    ? data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export interface ListaConversasProps {
  conversas: Conversa[];
  /** `null` enquanto a primeira carga não terminou — evita mostrar o vazio à toa. */
  carregando: boolean;
  conversaAtivaId: string | null;
  onSelecionar: (id: string) => void;
  onNova: () => void;
  /** Devolve `false` em caso de erro — a linha volta ao título anterior. */
  onRenomear: (id: string, titulo: string) => Promise<boolean>;
  /** Devolve `false` em caso de erro — a linha sai do modo de confirmação. */
  onExcluir: (id: string) => Promise<boolean>;
}

export function ListaConversas({
  conversas,
  carregando,
  conversaAtivaId,
  onSelecionar,
  onNova,
  onRenomear,
  onExcluir,
}: ListaConversasProps) {
  return (
    <div className="flex h-full flex-col gap-3">
      <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={onNova}>
        <Plus className="size-4" aria-hidden />
        Nova conversa
      </Button>

      {carregando ? (
        <p className="px-1 text-sm text-muted">Carregando conversas…</p>
      ) : conversas.length === 0 ? (
        <EmptyState
          titulo="Nenhuma conversa ainda"
          descricao="Pergunte alguma coisa ao copiloto — ela aparece aqui depois da primeira resposta."
        />
      ) : (
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto" aria-label="Conversas anteriores">
          {conversas.map((conversa) => (
            <ConversaItem
              key={conversa.id}
              conversa={conversa}
              ativa={conversa.id === conversaAtivaId}
              onSelecionar={() => onSelecionar(conversa.id)}
              onRenomear={(titulo) => onRenomear(conversa.id, titulo)}
              onExcluir={() => onExcluir(conversa.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface ConversaItemProps {
  conversa: Conversa;
  ativa: boolean;
  onSelecionar: () => void;
  onRenomear: (titulo: string) => Promise<boolean>;
  onExcluir: () => Promise<boolean>;
}

/**
 * Uma linha da lista, com os três modos que ela pode assumir. Vive num
 * componente próprio (em vez de estado dentro do `.map()` do pai) porque cada
 * linha precisa do seu próprio `useState`/`useRef` de edição — hooks não
 * podem nascer dentro de um laço, e um único estado "linha em edição" no pai
 * remontaria a lista inteira a cada tecla digitada.
 */
function ConversaItem({ conversa, ativa, onSelecionar, onRenomear, onExcluir }: ConversaItemProps) {
  const [modo, setModo] = React.useState<'normal' | 'editando' | 'confirmandoExclusao'>('normal');
  const [titulo, setTitulo] = React.useState(conversa.titulo);
  const [pendente, setPendente] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // O título vindo do servidor muda por fora (ex.: outra aba renomeou) —
  // acompanha, mas só fora do modo de edição para não pisar num rascunho que
  // o usuário ainda está digitando.
  React.useEffect(() => {
    if (modo === 'normal') setTitulo(conversa.titulo);
  }, [conversa.titulo, modo]);

  const iniciarEdicao = React.useCallback(() => {
    setTitulo(conversa.titulo);
    setModo('editando');
  }, [conversa.titulo]);

  // Autofoco + seleção do texto ao entrar em modo de edição — o usuário
  // normalmente quer substituir o título todo, não só posicionar o cursor.
  React.useEffect(() => {
    if (modo === 'editando') {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [modo]);

  const confirmarEdicao = React.useCallback(async () => {
    const limpo = titulo.trim();
    // Vazio ou só espaços: mantém o título anterior, sem gravar nada — regra
    // explícita do pedido, evita conversa com título em branco na lista.
    if (limpo.length === 0 || limpo === conversa.titulo) {
      setTitulo(conversa.titulo);
      setModo('normal');
      return;
    }
    setPendente(true);
    const ok = await onRenomear(limpo);
    setPendente(false);
    if (!ok) setTitulo(conversa.titulo);
    setModo('normal');
  }, [titulo, conversa.titulo, onRenomear]);

  const cancelarEdicao = React.useCallback(() => {
    setTitulo(conversa.titulo);
    setModo('normal');
  }, [conversa.titulo]);

  const confirmarExclusao = React.useCallback(async () => {
    setPendente(true);
    const ok = await onExcluir();
    setPendente(false);
    if (!ok) setModo('normal');
    // Em caso de sucesso a linha some porque o pai remove a conversa da lista
    // — não há necessidade de voltar o modo aqui.
  }, [onExcluir]);

  if (modo === 'confirmandoExclusao') {
    return (
      <li>
        <ConfirmInline
          titulo="Excluir esta conversa?"
          descricao="As mensagens somem junto — não é possível desfazer."
          confirmLabel="Excluir"
          cancelLabel="Cancelar"
          tone="negativo"
          pendente={pendente}
          onConfirm={() => void confirmarExclusao()}
          onCancel={() => setModo('normal')}
        />
      </li>
    );
  }

  if (modo === 'editando') {
    return (
      <li>
        <div className="flex items-center gap-1 rounded-lg bg-surface-2 px-2 py-1">
          <Input
            ref={inputRef}
            value={titulo}
            disabled={pendente}
            onChange={(e) => setTitulo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void confirmarEdicao();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelarEdicao();
              }
            }}
            className="h-9 flex-1 bg-surface px-2 text-sm"
            aria-label="Título da conversa"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pendente}
            onClick={() => void confirmarEdicao()}
            aria-label="Confirmar novo título"
            className="min-h-[44px] min-w-[44px] px-0"
          >
            <Check className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pendente}
            onClick={cancelarEdicao}
            aria-label="Cancelar edição do título"
            className="min-h-[44px] min-w-[44px] px-0"
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="group flex items-center gap-0.5 rounded-lg">
      <button
        type="button"
        onClick={onSelecionar}
        aria-current={ativa ? 'true' : undefined}
        className={cn(
          'flex min-h-[44px] flex-1 flex-col justify-center gap-0.5 rounded-lg px-3 py-1.5 text-left transition-colors',
          ativa ? 'bg-surface-2 text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg',
        )}
      >
        <span className={cn('truncate text-sm', ativa && 'font-medium')}>{conversa.titulo}</span>
        <span className="text-xs text-faint">{formatarQuando(conversa.atualizadaEm)}</span>
      </button>
      {/* `stopPropagation` nos dois botões: sem isso o clique também
          borbulharia para qualquer handler de seleção num ancestral — hoje
          não há nenhum, mas a linha inteira já foi um único `<button>` antes
          desta mudança, então a guarda documenta a intenção e evita a
          regressão se alguém reintroduzir isso. */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          iniciarEdicao();
        }}
        aria-label={`Renomear "${conversa.titulo}"`}
        className="min-h-[44px] min-w-[44px] shrink-0 px-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
      >
        <Pencil className="size-4" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          setModo('confirmandoExclusao');
        }}
        aria-label={`Excluir "${conversa.titulo}"`}
        className="min-h-[44px] min-w-[44px] shrink-0 px-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
      >
        <Trash2 className="size-4" aria-hidden />
      </Button>
    </li>
  );
}
