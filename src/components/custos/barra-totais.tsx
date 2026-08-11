import type { ResumoMensalCustos } from '@/application/custos-view';
import { formatBRL } from '@/shared/dinheiro';

/**
 * Barra de totais persistente acima das abas. Ela existe porque o dono precisa
 * COMPARAR — "quanto do meu mês é fixo, quanto é parcela, quanto sobra livre".
 * Três rotas soltas destruiriam essa comparação.
 *
 * R4 (nada comprometido aparece como disponível): fixo, provisão e parcela são
 * colunas SEPARADAS de "livre". Nenhum número aqui soma bolsos diferentes, e
 * "Livre" é `verbaVariavel − parcelasComprometidas` — o único campo que
 * responde "quanto posso gastar".
 *
 * Server Component puro: recebe o read-model pronto, não calcula nada.
 *
 * SOBRE O RÓTULO "no ciclo atual" — não troque por "por mês". Estes números
 * vêm do ciclo CONGELADO (SPEC 5.2), enquanto a tabela logo abaixo soma o
 * cadastro de hoje. Os dois divergem sempre que um custo é editado depois de o
 * ciclo nascer, e foi exatamente isso que a revisão da Fase 7 pegou na tela:
 * "Fixos R$ 4.884,00 por mês" ao lado de "Custos fixos · R$ 5.605,00/mês", sem
 * nada dizendo que um é o congelado e o outro é o vigente. Divergência sem
 * rótulo lê-se como bug de soma.
 */
export function BarraTotais({ resumo }: { resumo: ResumoMensalCustos }) {
  const itens = [
    { rotulo: 'Fixos', valorCents: resumo.fixosCents },
    { rotulo: 'Provisão', valorCents: resumo.provisaoMensalCents },
    { rotulo: 'Parcelas', valorCents: resumo.parcelasComprometidasCents },
  ] as const;

  return (
    <section
      aria-label={`Composição do ciclo ${resumo.periodoLabel}`}
      className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] bg-border sm:grid-cols-4"
    >
      {itens.map((item) => (
        <div key={item.rotulo} className="bg-surface px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-faint">{item.rotulo}</p>
          <p className="tnum mt-1 text-lg text-fg">{formatBRL(item.valorCents)}</p>
          <p className="text-xs text-faint">no ciclo atual</p>
        </div>
      ))}
      <div className="bg-surface px-4 py-3">
        <p className="text-xs uppercase tracking-wide text-faint">Livre</p>
        <p className="tnum mt-1 text-lg font-medium text-accent">
          {formatBRL(resumo.verbaLivreCents)}
        </p>
        <p className="text-xs text-faint">verba − parcelas</p>
      </div>
    </section>
  );
}
