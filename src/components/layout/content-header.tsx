import type { ReactNode } from 'react';

export interface ContentHeaderProps {
  /** Título da página (ex.: "Hoje", "Ciclo", "Patrimônio"). */
  titulo: string;
  /** Período do ciclo corrente ou outro subtítulo curto, quando fizer sentido. */
  periodo?: string;
  /** Ações de contexto (botões) alinhadas à direita do cabeçalho. */
  acoes?: ReactNode;
}

/**
 * Cabeçalho de conteúdo do painel de desktop. Puramente apresentacional —
 * recebe título/período/ações por props, nunca busca dados. Visível apenas
 * em telas >= 1024px: no mobile cada tela já traz seu próprio cabeçalho
 * compacto (SPEC 11 — não redesenhar o mobile existente).
 */
export function ContentHeader({ titulo, periodo, acoes }: ContentHeaderProps) {
  return (
    <header className="mb-8 hidden items-start justify-between border-b border-border pb-6 lg:flex">
      <div>
        <h1 className="text-2xl font-semibold text-fg">{titulo}</h1>
        {periodo ? <p className="tnum mt-1 text-sm text-muted">{periodo}</p> : null}
      </div>
      {acoes ? <div className="flex items-center gap-2">{acoes}</div> : null}
    </header>
  );
}
