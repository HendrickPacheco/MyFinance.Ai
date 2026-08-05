/**
 * Uma resposta do copiloto, com a sua PROVENIÊNCIA visível.
 *
 * Este componente existe por um motivo só: o usuário precisa conseguir ver de
 * onde o número veio. Um copiloto que acerta e um que alucina produzem textos
 * indistinguíveis — a diferença só aparece se a origem for mostrada.
 *
 * Três estados que a UI trata de forma diferente, do mais confiável ao menos:
 *
 *  1. resposta com ferramentas e todos os valores rastreados — o caso normal;
 *  2. resposta SEM nenhuma ferramenta — é opinião, não dado, e é rotulada assim;
 *  3. resposta com valor em R$ que nenhuma ferramenta devolveu — alerta, porque
 *     significa que o modelo inventou ou recompôs um número.
 */
import * as React from 'react';
import { AlertTriangle, MessageCircle, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui';
import { semMarkdown } from '@/shared/texto';
import type { RespostaCopiloto } from '@/application/ia/copiloto';
import { CartaoProposta } from './cartao-proposta';

/** Realça os valores que vieram de ferramenta, para o olho achar o número. */
function TextoComValores({ texto: bruto, valores }: { texto: string; valores: readonly string[] }) {
  const texto = semMarkdown(bruto);
  if (valores.length === 0) return <>{texto}</>;

  // Os mais longos primeiro: senão "R$ 1,00" quebraria "R$ 1,00 0,50" no meio.
  const ordenados = [...new Set(valores)].sort((a, b) => b.length - a.length);
  const padrao = new RegExp(`(${ordenados.map(escaparRegex).join('|')})`, 'g');

  return (
    <>
      {texto.split(padrao).map((parte, i) =>
        ordenados.includes(parte) ? (
          <strong key={i} className="tnum font-semibold text-fg">
            {parte}
          </strong>
        ) : (
          <React.Fragment key={i}>{parte}</React.Fragment>
        ),
      )}
    </>
  );
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function RespostaComProveniencia({ resposta }: { resposta: RespostaCopiloto }) {
  const valores = resposta.valoresCitados.map((v) => v.valorFormatado);
  const temAlerta = resposta.valoresNaoRastreados.length > 0;

  return (
    <div className="space-y-3">
      <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-fg">
        <TextoComValores texto={resposta.texto} valores={valores} />
      </p>

      {temAlerta ? (
        <div className="flex items-start gap-2 rounded-lg border border-negativo/40 bg-negativo/10 px-3 py-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-negativo" aria-hidden />
          <p className="text-sm text-fg">
            <span className="font-medium text-negativo">Valor sem origem.</span>{' '}
            {resposta.valoresNaoRastreados.map((v) => (
              <span key={v} className="tnum">
                {v}{' '}
              </span>
            ))}
            não veio de nenhuma consulta ao motor de cálculo. Confira na tela antes de decidir
            qualquer coisa com esse número.
          </p>
        </div>
      ) : null}

      {resposta.incompleta ? (
        <p className="text-sm text-atencao">
          A consulta foi interrompida por limite de etapas — a resposta pode estar incompleta.
        </p>
      ) : null}

      {/*
        Propostas (D-8). Vêm DEPOIS do texto e antes da proveniência: o dono lê
        o que o copiloto entendeu, confere o valor no cartão e só então clica.
        Nada aqui existe no banco até o clique.
      */}
      {resposta.propostas.map((item, i) => (
        <CartaoProposta key={i} item={item} />
      ))}

      <Proveniencia resposta={resposta} />
    </div>
  );
}

function Proveniencia({ resposta }: { resposta: RespostaCopiloto }) {
  if (resposta.semFerramenta) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <MessageCircle className="size-3.5" aria-hidden />
        <span>Resposta sem consulta a dados — é uma opinião, não um número seu.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Wrench className="size-3.5 text-muted" aria-hidden />
      <span className="text-xs text-muted">Consultou:</span>
      {resposta.ferramentasUsadas.map((f, i) => (
        <Badge
          key={`${f.nome}-${i}`}
          tone={f.falhou ? 'atencao' : 'neutral'}
          title={f.comoFoiCalculado ?? undefined}
        >
          {f.nome}
          {f.falhou ? ' (falhou)' : ''}
        </Badge>
      ))}
    </div>
  );
}
