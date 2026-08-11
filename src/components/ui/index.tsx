/**
 * Primitivas de UI (estilo shadcn, escritas à mão para não ter cara de
 * template — SPEC 11).
 *
 * Este módulo NÃO tem `'use client'` — a maioria das primitivas
 * (`Tabs`, `Table`/`THead`/`TBody`/`TFoot`/`Tr`/`Th`/`Td`, `Card` e afins,
 * `Badge`, `EmptyState`, `Segmented` em modo navegação) é server-safe: sem
 * estado, só classes. Mas `Modal`, `ConfirmDialog`, `Toast` e `Segmented` em
 * modo controle (`onChange`) usam `useState`/`useEffect`/portal e EXIGEM uma
 * fronteira de cliente — quem os importa precisa estar em (ou abaixo de) um
 * componente `'use client'`, senão falha em runtime sem erro de build.
 */
import * as React from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
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
   * `alertdialog` para confirmação destrutiva — leitor de tela anuncia o
   * conteúdo com urgência e não deixa o usuário sair sem decidir. `dialog`
   * (padrão) para formulários e painéis.
   */
  role?: 'dialog' | 'alertdialog';
  /**
   * Id do elemento que descreve a CONSEQUÊNCIA da ação. Em `alertdialog` é o
   * que separa o leitor de tela anunciar "Tem certeza?" de anunciar "7 parcelas
   * já pagas, 6 em ciclos fechados".
   */
  ariaDescribedBy?: string;
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
export function Modal({
  open,
  onClose,
  ariaLabel,
  children,
  className,
  role = 'dialog',
  ariaDescribedBy,
}: ModalProps) {
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
        role={role}
        aria-modal="true"
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
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

/* ------------------------------------------------------------------- Tabs */
export interface TabItem {
  href: string;
  label: string;
  /** Contagem opcional ao lado do rótulo (ex.: "Parcelados 13"). */
  contagem?: number;
}

export interface TabsProps {
  itens: readonly TabItem[];
  /** `pathname` atual — decide qual aba está ativa. */
  ativo: string;
  ariaLabel: string;
  className?: string;
}

/**
 * Navegação em abas entre sub-rotas irmãs.
 *
 * Deliberadamente NÃO usa `role="tablist"`/`role="tab"`/`aria-selected`. Esses
 * papéis prometem ao leitor de tela um painel trocado por JS dentro do mesmo
 * documento; aqui cada aba é um `<Link>` que navega de verdade e remonta a
 * página, então a promessa seria falsa. A marcação honesta para navegação é
 * `<nav>` + `aria-current="page"`, que é o que o leitor de tela já sabe ler.
 *
 * Efeito colateral bom: sem estado e sem handler de teclado (Tab e Enter já
 * funcionam em links por padrão), isto continua sendo um Server Component.
 */
export function Tabs({ itens, ativo, ariaLabel, className }: TabsProps) {
  return (
    <nav aria-label={ariaLabel} className={className}>
      <ul className="flex items-center gap-1 overflow-x-auto border-b border-border">
        {itens.map((item) => {
          const selecionado = ativo === item.href || ativo.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={selecionado ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap px-4 text-sm transition-colors',
                  // A borda de baixo é o indicador visual; ela existe sempre
                  // (transparente quando inativa) para a linha não "pular" 2px
                  // ao trocar de aba.
                  'border-b-2 border-transparent',
                  selecionado
                    ? 'border-accent font-medium text-accent'
                    : 'text-muted hover:text-fg',
                )}
              >
                {item.label}
                {item.contagem !== undefined ? (
                  <span className="tnum text-xs text-faint">{item.contagem}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* -------------------------------------------------------------- Segmented */
export interface SegmentedOptionNavegacao<T extends string> {
  value: T;
  label: string;
  /** Item vira `<Link>`; o grupo inteiro é navegação (estado na URL). */
  href: string;
}

export interface SegmentedOptionControle<T extends string> {
  value: T;
  label: string;
  href?: undefined;
}

/**
 * Dois modos, nunca misturados — a união discriminada por `href` proíbe em
 * tempo de compilação o caso que gerava ARIA inválido (`role="radiogroup"`
 * ausente no container por causa de uma opção sem `href`, enquanto os itens
 * sem `href` continuavam anunciando `role="radio"` órfão): "6/12/24 meses"
 * junto de "Personalizado" só é seguro se TODAS as opções forem `href` (o
 * grupo vira `<Link>`) ou NENHUMA for (o grupo vira `<button role="radio">`).
 *
 * - **Navegação** (todo item com `href`): renderiza `<Link aria-current="page">`. Server-safe.
 * - **Controle** (nenhum item com `href`): renderiza `<button>` em
 *   `role="radiogroup"` com `aria-checked` — o papel certo para escolha
 *   exclusiva, que um grupo de botões sem papel nenhum não comunica.
 */
export type SegmentedProps<T extends string> =
  | {
      opcoes: readonly SegmentedOptionNavegacao<T>[];
      valor: T;
      onChange?: undefined;
      ariaLabel: string;
      className?: string;
    }
  | {
      opcoes: readonly SegmentedOptionControle<T>[];
      valor: T;
      onChange: (valor: T) => void;
      ariaLabel: string;
      className?: string;
    };

export function Segmented<T extends string>({
  opcoes,
  valor,
  onChange,
  ariaLabel,
  className,
}: SegmentedProps<T>) {
  const navegacao = opcoes.every((o) => o.href !== undefined);

  const classesItem = (selecionado: boolean): string =>
    cn(
      'inline-flex min-h-[40px] items-center justify-center rounded-lg px-3 text-sm transition-colors',
      selecionado ? 'bg-accent font-medium text-accent-fg' : 'text-muted hover:text-fg',
    );

  return (
    <div
      role={navegacao ? undefined : 'radiogroup'}
      aria-label={ariaLabel}
      className={cn('inline-flex gap-1 rounded-xl bg-surface-2 p-1', className)}
    >
      {opcoes.map((o) => {
        const selecionado = o.value === valor;
        return o.href ? (
          <Link
            key={o.value}
            href={o.href}
            aria-current={selecionado ? 'page' : undefined}
            className={classesItem(selecionado)}
          >
            {o.label}
          </Link>
        ) : (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selecionado}
            onClick={() => onChange?.(o.value)}
            className={classesItem(selecionado)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ Table */
/**
 * Tabela semântica de verdade (`<table>`), e não `grid` de `<div>`s como o
 * extrato de variáveis. O motivo é concreto: estas listas têm ordenação por
 * coluna, e `aria-sort` só existe em `<th>`. Além disso o leitor de tela
 * anuncia "Notebook, coluna Valor por mês, R$ 291,58" em vez de despejar sete
 * spans órfãos.
 *
 * Toda coluna monetária ou de data usa `<Td numerico>` — alinha à direita e
 * aplica `tnum`, para os dígitos ficarem na mesma coluna óptica.
 */
export function Table({
  className,
  legenda,
  children,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement> & {
  /**
   * Resumo da tabela para leitor de tela (`<caption class="sr-only">`), ex.:
   * "Custos fixos ativos, 10 itens, total R$ 4.884,00 por mês". Visualmente
   * oculto: quem enxerga já lê o título do card e o rodapé de totais.
   */
  legenda: string;
}) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full text-sm', className)} {...props}>
        <caption className="sr-only">{legenda}</caption>
        {children}
      </table>
    </div>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('border-b border-border', className)} {...props} />;
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-border', className)} {...props} />;
}

export function TFoot({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tfoot className={cn('border-t border-border text-muted', className)} {...props} />;
}

export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('hover:bg-surface-2/50', className)} {...props} />;
}

export function Th({
  className,
  numerico = false,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { numerico?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        'pb-2 text-xs font-normal tracking-wide text-faint uppercase',
        numerico ? 'text-right' : 'text-left',
        className,
      )}
      {...props}
    />
  );
}

export function Td({
  className,
  numerico = false,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { numerico?: boolean }) {
  return (
    <td
      className={cn('py-3', numerico ? 'tnum text-right' : 'text-left', className)}
      {...props}
    />
  );
}

export type OrdemColuna = 'asc' | 'desc' | 'none';

export interface SortableThProps
  extends Omit<React.ThHTMLAttributes<HTMLTableCellElement>, 'onClick'> {
  ordem: OrdemColuna;
  numerico?: boolean;
  /** Ordenação por URL (server component). Exclusivo com `onClick`. */
  href?: string;
  /** O handler é do `<button>` interno, não do `<th>` — daí o `Omit` acima. */
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  children: React.ReactNode;
}

/**
 * Cabeçalho ordenável. `aria-sort` vai no `<th>` (é lá que a especificação o
 * define) e o alvo clicável é um `<button>`/`<Link>` interno — um `<th>` com
 * `onClick` não é focável nem acionável por teclado.
 */
export function SortableTh({
  ordem,
  numerico = false,
  href,
  onClick,
  children,
  className,
  ...props
}: SortableThProps) {
  const Icone = ordem === 'asc' ? ChevronUp : ordem === 'desc' ? ChevronDown : ChevronsUpDown;
  const conteudo = (
    <>
      {children}
      <Icone size={12} className={ordem === 'none' ? 'text-faint' : 'text-accent'} aria-hidden />
    </>
  );
  const classesGatilho = cn(
    'inline-flex items-center gap-1 rounded text-xs tracking-wide uppercase transition-colors hover:text-fg',
    ordem === 'none' ? 'text-faint' : 'text-fg',
  );

  return (
    <th
      scope="col"
      aria-sort={ordem === 'asc' ? 'ascending' : ordem === 'desc' ? 'descending' : 'none'}
      className={cn('pb-2 font-normal', numerico ? 'text-right' : 'text-left', className)}
      {...props}
    >
      {href ? (
        <Link href={href} className={classesGatilho}>
          {conteudo}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={classesGatilho}>
          {conteudo}
        </button>
      )}
    </th>
  );
}

/* ---------------------------------------------------------- ConfirmDialog */
export interface ConfirmDialogProps {
  open: boolean;
  titulo: string;
  /**
   * A consequência da ação, em números concretos — "7 parcelas já pagas,
   * R$ 2.041,06, em 6 ciclos fechados", nunca "esta ação é irreversível".
   * É este nó que o leitor de tela anuncia via `aria-describedby`.
   */
  consequencia: React.ReactNode;
  /**
   * Rótulo que diz O QUE VAI ACONTECER ("Cancelar 5 futuras"), nunca
   * "Confirmar" — o usuário lê o botão, não o parágrafo.
   */
  confirmLabel: string;
  cancelLabel?: string;
  /** Ação alternativa e segura (ex.: "Desativar"), oferecida DENTRO do diálogo. */
  alternativa?: { label: string; onClick: () => void };
  /**
   * Quando presente, mostra um checkbox com este texto e o botão de confirmar
   * só habilita depois de marcado. Use apenas quando a ação reescreve
   * histórico — pedir ciência em toda exclusão treina o usuário a ignorar.
   */
  exigirCiente?: string;
  tone?: 'neutral' | 'negativo';
  pendente?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmação de ação com consequência pesada — o irmão graduado de
 * `ConfirmInline`. Use quando apagar reescreve histórico ou atinge coisas que
 * o usuário não está vendo na tela; para o caso leve, `ConfirmInline` continua
 * sendo o certo.
 *
 * Não negociável aqui:
 * - `role="alertdialog"` com `aria-describedby` apontando para a CONSEQUÊNCIA.
 * - O foco inicial vai para "Cancelar", **nunca** para o botão destrutivo.
 * - Sem promessa de desfazer: quando a ação não é reversível, o diálogo não
 *   sugere que seja.
 */
export function ConfirmDialog({
  open,
  titulo,
  consequencia,
  confirmLabel,
  cancelLabel = 'Cancelar',
  alternativa,
  exigirCiente,
  tone = 'negativo',
  pendente = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [ciente, setCiente] = React.useState(false);
  const idDescricao = React.useId();
  const idCiente = React.useId();
  const idCienteTexto = React.useId();

  // Reabrir o diálogo nunca herda a ciência marcada na vez anterior.
  React.useEffect(() => {
    if (open) setCiente(false);
  }, [open]);

  const bloqueado = pendente || (exigirCiente !== undefined && !ciente);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      role="alertdialog"
      ariaLabel={titulo}
      ariaDescribedBy={idDescricao}
      className="max-w-md"
    >
      <h2 className="text-fg text-base font-medium">{titulo}</h2>
      <div id={idDescricao} className="mt-3 space-y-2 text-sm text-muted">
        {consequencia}
      </div>

      {exigirCiente !== undefined ? (
        <label
          htmlFor={idCiente}
          className="mt-4 flex cursor-pointer items-start gap-2 rounded-xl border border-border-strong bg-surface-2 p-3 text-sm text-fg"
        >
          <Checkbox
            id={idCiente}
            checked={ciente}
            onChange={(e) => setCiente(e.target.checked)}
            className="mt-0.5"
          />
          <span id={idCienteTexto}>{exigirCiente}</span>
        </label>
      ) : null}

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button
          variant="ghost"
          onClick={onCancel}
          disabled={pendente}
          data-modal-initial-focus
        >
          {cancelLabel}
        </Button>
        {alternativa ? (
          <Button variant="outline" onClick={alternativa.onClick} disabled={pendente}>
            {alternativa.label}
          </Button>
        ) : null}
        <Button
          variant={tone === 'negativo' ? 'danger' : 'primary'}
          // `aria-disabled` em vez de `disabled`: `disabled` tira o botão da
          // árvore de acessibilidade e o `aria-describedby` abaixo (que aponta
          // para a explicação do checkbox) fica inalcançável para o leitor de
          // tela. Com `aria-disabled` o botão segue focável e descrito; o
          // guard no `onClick` garante que a ação não dispara mesmo assim.
          aria-disabled={bloqueado}
          onClick={bloqueado ? undefined : onConfirm}
          aria-describedby={exigirCiente !== undefined ? idCienteTexto : undefined}
          className={bloqueado ? 'pointer-events-none opacity-50' : undefined}
        >
          {pendente ? 'Processando…' : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ Toast */
export interface ToastProps {
  /** O fato, sem comemoração: "Lançado R$ 42,00 em Mercado" (SPEC 11). */
  texto: string;
  acao?: { label: string; onClick: () => void };
  /**
   * Distância do rodapé. `alta` (padrão) desvia da navegação inferior do
   * mobile; `baixa` é para quando o toast vive dentro de um modal, que não tem
   * a barra por baixo.
   */
  posicao?: 'alta' | 'baixa';
}

/**
 * Aviso efêmero no rodapé, com ação opcional de desfazer. Quem chama controla
 * montagem e o timer — o componente não some sozinho.
 *
 * `role="status"` + `aria-live="polite"` fazem o leitor de tela anunciar o
 * lançamento sem roubar o foco. Sem isso o toast é invisível para quem não
 * enxerga a tela, e junto com ele some a única chance de desfazer.
 */
export function Toast({ texto, acao, posicao = 'alta' }: ToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        // A faixa `fixed inset-x-0` cobre a largura toda; sem `pointer-events-none`
        // aqui, o espaço vazio dos dois lados da pílula intercepta cliques que
        // deveriam ir para o conteúdo por baixo. `pointer-events-auto` na pílula
        // devolve a interatividade só onde ela é visível.
        'pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4',
        posicao === 'alta' ? 'bottom-24' : 'bottom-6',
      )}
    >
      <div className="pointer-events-auto flex items-center gap-4 rounded-full border border-border-strong bg-surface-2 px-5 py-3 shadow-lg">
        <span className="text-sm text-fg">{texto}</span>
        {acao ? (
          <button
            type="button"
            onClick={acao.onClick}
            className="text-sm font-semibold text-accent hover:underline"
          >
            {acao.label}
          </button>
        ) : null}
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
