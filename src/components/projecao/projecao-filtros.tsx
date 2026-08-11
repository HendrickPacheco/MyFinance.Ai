/**
 * Seletor de horizonte + exportação da tela `/projecao`.
 *
 * O horizonte é NAVEGAÇÃO, não estado de componente: cada opção é um `<Link>`
 * para `?horizonte=N` (variante de navegação do `Segmented`), o que mantém a
 * página um Server Component, deixa o horizonte no link compartilhável e faz o
 * botão "voltar" do navegador funcionar como o usuário espera.
 *
 * O CSV é um `<a download>` para uma rota GET, e não um botão com JS: o
 * conteúdo é serializado no servidor (com BOM, senão o Excel mostra
 * "ProvisÃ£o") e o navegador cuida do resto. Sem JS envolvido, o download
 * funciona igual em qualquer estado da página.
 */
import { Download } from 'lucide-react';
import { Segmented } from '@/components/ui';
import {
  HORIZONTES_PROJECAO,
  hrefCsvProjecao,
  hrefProjecao,
  type HorizonteProjecao,
} from '@/lib/projecao-horizonte';

export function ProjecaoFiltros({ horizonte }: { horizonte: HorizonteProjecao }) {
  const opcoes = HORIZONTES_PROJECAO.map((meses) => ({
    value: String(meses),
    label: `${String(meses)} meses`,
    href: hrefProjecao(meses),
  }));

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Segmented
        opcoes={opcoes}
        valor={String(horizonte)}
        ariaLabel="Horizonte da projeção"
      />

      <a
        href={hrefCsvProjecao(horizonte)}
        download
        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border px-3 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <Download size={16} strokeWidth={1.8} aria-hidden="true" />
        Exportar CSV
      </a>
    </div>
  );
}
