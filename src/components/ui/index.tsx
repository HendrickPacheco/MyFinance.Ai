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
