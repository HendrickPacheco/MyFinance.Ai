/**
 * Primitivas de UI (estilo shadcn, escritas à mão para não ter cara de
 * template — SPEC 11). Todas server-safe: sem estado, só classes.
 */
import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

/* ----------------------------------------------------------------- Button */
type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'danger' | 'subtle';
type ButtonSize = 'sm' | 'md' | 'lg';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:brightness-110 font-medium',
  danger: 'bg-negativo text-[#1a0808] hover:brightness-110 font-medium',
  outline: 'border border-border-strong text-fg hover:bg-surface-2',
  ghost: 'text-muted hover:text-fg hover:bg-surface-2',
  subtle: 'bg-surface-2 text-fg hover:brightness-125',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm rounded-lg',
  md: 'h-11 px-4 text-sm rounded-xl',
  lg: 'h-14 px-6 text-base rounded-xl',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap transition-all',
        'disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

/* ------------------------------------------------------------------- Card */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] border border-border bg-surface',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pt-5 pb-2', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('text-sm font-medium tracking-wide text-muted uppercase', className)} {...props} />
  );
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pb-5', className)} {...props} />;
}

/* ------------------------------------------------------------------ Input */
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-fg',
        'placeholder:text-faint focus:border-accent focus:outline-none',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

/* ---------------------------------------------------------------- Select */
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-fg',
      'focus:border-accent focus:outline-none',
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = 'Select';

/* --------------------------------------------------------------- Checkbox */
/**
 * Puramente visual e controlada — sem estado próprio (mesma convenção de
 * `Input`/`Select`). A lógica de otimismo/reversão fica em quem consome
 * (ex.: `src/components/dashboard/pagamento-toggle.tsx`), nunca aqui.
 */
export const Checkbox = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        'h-5 w-5 shrink-0 rounded border-border-strong bg-surface-2 accent-accent',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Checkbox.displayName = 'Checkbox';

/* ------------------------------------------------------------------ Label */
export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1.5 block text-sm text-muted', className)} {...props} />;
}

/* ------------------------------------------------------------------ Badge */
export function Badge({
  className,
  tone = 'neutral',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: 'neutral' | 'positivo' | 'atencao' | 'negativo';
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-surface-2 text-muted',
    positivo: 'bg-positivo/15 text-positivo',
    atencao: 'bg-atencao/15 text-atencao',
    negativo: 'bg-negativo/15 text-negativo',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

/* ---------------------------------------------------------- ConfirmInline */
export interface ConfirmInlineProps {
  /** Frase curta e factual descrevendo a ação (SPEC 11 — nunca julgadora). */
  titulo: string;
  /** Detalhe opcional (ex.: o que muda, quais ciclos são afetados). */
  descricao?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `negativo` para ações destrutivas (excluir); `neutral` para as demais. */
  tone?: 'neutral' | 'negativo';
  onConfirm: () => void;
  onCancel: () => void;
  /** Desabilita os botões enquanto uma ação assíncrona está em voo. */
  pendente?: boolean;
  className?: string;
}

/**
 * Confirmação inline (substitui `window.confirm`): some no fluxo da tela em
 * vez de abrir um diálogo nativo do navegador. Enter confirma, Esc cancela,
 * Tab fica contido entre os dois botões enquanto está aberta, e o foco volta
 * para o elemento que a abriu quando ela desmonta.
 */
export function ConfirmInline({
  titulo,
  descricao,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'neutral',
  onConfirm,
  onCancel,
  pendente = false,
  className,
}: ConfirmInlineProps) {
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  const confirmRef = React.useRef<HTMLButtonElement>(null);
  const descId = React.useId();

  React.useEffect(() => {
    const gatilho = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => {
      gatilho?.focus?.();
    };
  }, []);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // stopPropagation em todos os ramos: `ConfirmInline` pode ser aninhada
      // dentro de um `Modal` (ex.: confirmar descarte de rascunho antes de
      // fechar) — sem isso, Escape/Tab também acionariam o handler do Modal
      // ancestral logo em seguida, causando ações duplicadas.
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onConfirm();
        return;
      }
      if (e.key === 'Tab') {
        const foco = [cancelRef.current, confirmRef.current].filter(
          (el): el is HTMLButtonElement => el !== null,
        );
        if (foco.length === 0) return;
        const primeiro = foco[0];
        const ultimo = foco[foco.length - 1];
        if (!primeiro || !ultimo) return;
        if (e.shiftKey && document.activeElement === primeiro) {
          e.preventDefault();
          e.stopPropagation();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          e.stopPropagation();
          primeiro.focus();
        }
      }
    },
    [onConfirm, onCancel],
  );

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={titulo}
      aria-describedby={descricao ? descId : undefined}
      onKeyDown={handleKeyDown}
      className={cn(
        'rounded-xl border p-3',
        tone === 'negativo' ? 'border-negativo/40 bg-negativo/10' : 'border-border-strong bg-surface-2',
        className,
      )}
    >
      <p className="text-sm text-fg">{titulo}</p>
      {descricao ? (
        <p id={descId} className="mt-1 text-xs text-muted">
          {descricao}
        </p>
      ) : null}
      <div className="mt-3 flex justify-end gap-2">
        <Button
          ref={cancelRef}
          type="button"
          variant="ghost"
          size="sm"
          disabled={pendente}
          onClick={onCancel}
        >
          {cancelLabel}
        </Button>
        <Button
          ref={confirmRef}
          type="button"
          variant={tone === 'negativo' ? 'danger' : 'primary'}
          size="sm"
          disabled={pendente}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Modal */
const FOCAVEIS_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  open: boolean;
  /**
   * Chamado quando o usuário pede para fechar (Esc, clique no backdrop, ou
   * qualquer botão de fechar que o conteúdo renderize). Quem chama decide se
   * fecha de fato — ex.: interceptar e pedir confirmação se há um rascunho
   * não salvo, em vez de descartar silenciosamente.
   */
  onClose: () => void;
  /** Rótulo acessível do diálogo (não precisa haver um título visível). */
  ariaLabel: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Diálogo modal genérico (`role="dialog"` + `aria-modal`). Portal para
 * `document.body` via `createPortal`, com guarda de SSR (só monta a árvore do
 * portal depois do mount no client, evitando acessar `document` no servidor).
 *
 * Comportamento não negociável:
 * - Foco preso dentro do diálogo enquanto aberto (Tab cicla no início/fim).
 * - Esc e clique no backdrop chamam `onClose` (mesma função — ver acima).
 * - Foco inicial vai para `[data-modal-initial-focus]` dentro do conteúdo,
 *   se existir; senão, o primeiro elemento focável.
 * - Foco volta para o elemento que estava focado antes de abrir, ao fechar.
 * - `document.body` trava o scroll enquanto o modal está aberto.
 */
export function Modal({ open, onClose, ariaLabel, children, className }: ModalProps) {
  const [montado, setMontado] = React.useState(false);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const gatilhoRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => setMontado(true), []);

  React.useEffect(() => {
    if (!open) return;

    gatilhoRef.current = document.activeElement as HTMLElement | null;

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const alvoInicial =
      dialogRef.current?.querySelector<HTMLElement>('[data-modal-initial-focus]') ??
      dialogRef.current?.querySelector<HTMLElement>(FOCAVEIS_SELECTOR);
    alvoInicial?.focus();

    return () => {
      document.body.style.overflow = overflowAnterior;
      gatilhoRef.current?.focus?.();
    };
  }, [open]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const container = dialogRef.current;
        if (!container) return;
        const focaveis = Array.from(container.querySelectorAll<HTMLElement>(FOCAVEIS_SELECTOR));
        if (focaveis.length === 0) return;
        const primeiro = focaveis[0];
        const ultimo = focaveis[focaveis.length - 1];
        if (!primeiro || !ultimo) return;
        if (e.shiftKey && document.activeElement === primeiro) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primeiro.focus();
        }
      }
    },
    [onClose],
  );

  if (!montado || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" aria-hidden="true" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onKeyDown={handleKeyDown}
        className={cn(
          'relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius-card)]',
          'border border-border bg-surface p-6 shadow-xl',
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

/* -------------------------------------------------------------- Tooltip */
export interface TooltipAnchorRect {
  /** Topo vertical onde centralizar o tooltip (viewport, `position: fixed`). */
  top: number;
  /** Borda direita do gatilho — o tooltip nasce um pouco à direita disso. */
  right: number;
}

export interface TooltipPortalProps {
  label: string;
  /** `null` esconde o tooltip (também controla montagem: sem custo quando oculto). */
  anchorRect: TooltipAnchorRect | null;
}

/**
 * Tooltip decorativo, portalado para `document.body` (mesma convenção de SSR
 * do `Modal`: só monta a árvore do portal depois do mount no client). Usa
 * `position: fixed` calculado a partir do retângulo do elemento-gatilho em
 * vez de `position: absolute` relativo ao pai — isso é proposital: um
 * ancestral com `overflow: hidden`/`auto` (ex.: a sidebar colapsável e sua
 * lista de navegação rolável) cortaria um tooltip posicionado de forma
 * relativa, mesmo que o conteúdo do próprio ancestral não estivesse rolado.
 *
 * Puramente visual — `aria-hidden`: nunca é a fonte do nome acessível do
 * gatilho, que deve vir de um `aria-label` explícito no próprio elemento.
 */
export function TooltipPortal({ label, anchorRect }: TooltipPortalProps) {
  const [montado, setMontado] = React.useState(false);
  React.useEffect(() => setMontado(true), []);

  if (!montado || !anchorRect) return null;

  return createPortal(
    <span
      role="tooltip"
      aria-hidden="true"
      style={{ top: anchorRect.top, left: anchorRect.right + 12 }}
      className={cn(
        'pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-lg border',
        'border-border-strong bg-surface-2 px-2.5 py-1.5 text-xs text-fg shadow-xl',
      )}
    >
      {label}
    </span>,
    document.body,
  );
}

/* ------------------------------------------------------------- EmptyState */
export function EmptyState({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  descricao: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-border-strong px-6 py-12 text-center">
      <p className="text-fg font-medium">{titulo}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{descricao}</p>
      {acao ? <div className="mt-4">{acao}</div> : null}
    </div>
  );
}
