/**
 * Versão INERTE do cartão de proposta — usada só ao reabrir uma conversa
 * carregada do banco (Fase 3, painel de sessões).
 *
 * ─── POR QUE ESTE COMPONENTE EXISTE (decisão de segurança, não de estética) ───
 *
 * Uma proposta nunca é persistida como "já confirmada" — `Proveniencia` grava
 * o resumo e os detalhes que o modelo preparou, não um estado de execução.
 * Isso significa que, ao reabrir uma conversa antiga, o app genuinamente NÃO
 * SABE se aquele lançamento já foi gravado ou descartado naquela sessão.
 *
 * Se este card reaproveitasse `CartaoProposta` (que chama `confirmarProposta`
 * ao clicar), um clique em "Lançar R$ 47,00" numa conversa de semana passada
 * criaria uma transação DUPLICADA — o mesmo gasto lançado duas vezes, sem
 * nenhum aviso, porque o card não tem como saber que a primeira vez já
 * aconteceu.
 *
 * Por isso a inércia vive em outro arquivo: este componente nem importa
 * `confirmarProposta`, nem mantém estado de envio. A segurança não vem de uma
 * flag "somente leitura" — vem da ação de gravação estar simplesmente fora de
 * alcance a partir daqui. Card interativo só existe em `cartao-proposta.tsx`,
 * usado apenas na conversa que está sendo digitada agora (ver `copiloto-chat.tsx`).
 */
export function CartaoPropostaInerte({
  resumo,
  detalhes,
}: {
  resumo: string;
  detalhes: { rotulo: string; valor: string }[];
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/60 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted">{resumo}</p>
        <span className="shrink-0 text-xs text-faint">Proposta de uma conversa anterior</span>
      </div>

      <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        {detalhes.map((detalhe) => (
          <div key={detalhe.rotulo} className="flex justify-between gap-3 sm:block">
            <dt className="text-xs uppercase tracking-wide text-faint">{detalhe.rotulo}</dt>
            <dd className="tnum text-muted">{detalhe.valor}</dd>
          </div>
        ))}
      </dl>

      {/* Sem botão de confirmar/descartar de propósito — ver comentário acima. */}
    </div>
  );
}
