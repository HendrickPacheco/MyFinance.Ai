/**
 * Primitivas de UI (estilo shadcn, escritas à mão para não ter cara de
 * template — SPEC 11). Todas server-safe: sem estado, só classes.
 */
import * as React from 'react';
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
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
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
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
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
