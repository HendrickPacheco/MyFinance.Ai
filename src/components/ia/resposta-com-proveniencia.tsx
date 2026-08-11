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
 *
 * ─── VARIANTE HISTÓRICA (Fase 3) ───
 *
 * `RespostaComProveniencia` é usada na conversa que está sendo digitada AGORA
 * (propostas interativas). `RespostaHistorico` reconstrói a mesma UI a partir
 * de `MensagemConversa.proveniencia`, lido de volta do banco ao reabrir uma
 * conversa — as propostas ali entram INERTES (`CartaoPropostaInerte`), nunca
 * `CartaoProposta`. Os dois compartilham `CorpoResposta` para o texto, o
 * alerta de valor não rastreado e os chips de ferramenta nunca divergirem
 * visualmente entre o chat ao vivo e o histórico.
 */
import * as React from 'react';
import { AlertTriangle, MessageCircle, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui';
import { semMarkdown } from '@/shared/texto';
import type { RespostaCopiloto } from '@/application/ia/copiloto';
import type { Proveniencia as ProvenienciaDominio } from '@/domain/model/entidades';
import { CartaoProposta } from './cartao-proposta';
import { CartaoPropostaInerte } from './cartao-proposta-inerte';

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

interface FerramentaUsadaExibivel {
  nome: string;
  falhou: boolean;
  comoFoiCalculado: string | null;
}

interface CorpoRespostaProps {
  texto: string;
  /** Valores formatados ("R$ 47,00") já confirmados por ferramenta. */
  valoresCitados: readonly string[];
  /** Valores formatados que o dono já tinha informado nesta conversa — origem
   * conhecida, sem alerta (caso real 11/08/2026, ver `copiloto.ts`). */
  valoresInformados: readonly string[];
  valoresNaoRastreados: readonly string[];
  semFerramenta: boolean;
  incompleta: boolean;
  ferramentasUsadas: readonly FerramentaUsadaExibivel[];
  /** Cartões de proposta já montados — interativos ou inertes, a depender do chamador. */
  propostas: React.ReactNode;
}

/**
 * Corpo compartilhado entre a resposta ao vivo e a histórica. Nada aqui sabe
 * se está renderizando um turno recém-chegado da IA ou um turno reconstruído
 * de `Proveniencia` persistida — só recebe as partes já resolvidas.
 */
function CorpoResposta({
  texto,
  valoresCitados,
  valoresInformados,
  valoresNaoRastreados,
  semFerramenta,
  incompleta,
  ferramentasUsadas,
  propostas,
}: CorpoRespostaProps) {
  const temAlerta = valoresNaoRastreados.length > 0;

  return (
    <div className="space-y-3">
      <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-fg">
        <TextoComValores texto={texto} valores={[...valoresCitados, ...valoresInformados]} />
      </p>

      {/*
        Valor informado pelo dono NÃO é alerta (D-8/caso real 11/08/2026: ele
        digitou "70k", a resposta citou "R$ 70.000,00" e isso não é
        alucinação). No máximo uma marcação discreta, sem cor nova — o mesmo
        tom neutro do rodapé "Consultou:".
      */}
      {valoresInformados.length > 0 ? (
        <p className="text-xs text-muted">Você informou {valoresInformados.join(', ')}.</p>
      ) : null}

      {temAlerta ? (
        <div className="flex items-start gap-2 rounded-lg border border-negativo/40 bg-negativo/10 px-3 py-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-negativo" aria-hidden />
          <p className="text-sm text-fg">
            <span className="font-medium text-negativo">Valor sem origem.</span>{' '}
            {valoresNaoRastreados.map((v) => (
              <span key={v} className="tnum">
                {v}{' '}
              </span>
            ))}
            não veio de nenhuma consulta ao motor de cálculo. Confira na tela antes de decidir
            qualquer coisa com esse número.
          </p>
        </div>
      ) : null}

      {incompleta ? (
        <p className="text-sm text-atencao">
          A consulta foi interrompida por limite de etapas — a resposta pode estar incompleta.
        </p>
      ) : null}

      {/*
        Propostas (D-8). Vêm DEPOIS do texto e antes da proveniência: o dono lê
        o que o copiloto entendeu, confere o valor no cartão e só então clica
        (quando o cartão é interativo — ver `CartaoPropostaInerte`).
      */}
      {propostas}

      {semFerramenta ? (
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <MessageCircle className="size-3.5" aria-hidden />
          <span>Resposta sem consulta a dados — é uma opinião, não um número seu.</span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <Wrench className="size-3.5 text-muted" aria-hidden />
          <span className="text-xs text-muted">Consultou:</span>
          {ferramentasUsadas.map((f, i) => (
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
      )}
    </div>
  );
}

/** Resposta ao vivo — a que acabou de voltar do modelo, na conversa em andamento. */
export function RespostaComProveniencia({ resposta }: { resposta: RespostaCopiloto }) {
  return (
    <CorpoResposta
      texto={resposta.texto}
      valoresCitados={resposta.valoresCitados.map((v) => v.valorFormatado)}
      valoresInformados={resposta.valoresInformados}
      valoresNaoRastreados={resposta.valoresNaoRastreados}
      semFerramenta={resposta.semFerramenta}
      incompleta={resposta.incompleta}
      ferramentasUsadas={resposta.ferramentasUsadas}
      propostas={resposta.propostas.map((item, i) => (
        <CartaoProposta key={i} item={item} />
      ))}
    />
  );
}

/**
 * Resposta histórica — reconstruída de `MensagemConversa.proveniencia` ao
 * reabrir uma conversa. `proveniencia === null` é o caso comum de uma
 * resposta que não teve ferramenta, proposta nem alerta a guardar (ver
 * `montarProveniencia` em `src/actions/ia.ts`): aqui isso é só o texto puro,
 * sem chips — não há nada de proveniência para reconstruir.
 */
export function RespostaHistorico({
  conteudo,
  proveniencia,
}: {
  conteudo: string;
  proveniencia: ProvenienciaDominio | null;
}) {
  if (!proveniencia) {
    return <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-fg">{semMarkdown(conteudo)}</p>;
  }

  return (
    <CorpoResposta
      texto={conteudo}
      valoresCitados={proveniencia.valoresCitados.map((v) => v.valorFormatado)}
      valoresInformados={proveniencia.valoresInformados}
      valoresNaoRastreados={proveniencia.valoresNaoRastreados}
      semFerramenta={proveniencia.semFerramenta}
      incompleta={proveniencia.incompleta}
      ferramentasUsadas={proveniencia.ferramentasUsadas}
      propostas={proveniencia.propostas.map((item, i) => (
        <CartaoPropostaInerte key={i} resumo={item.resumo} detalhes={item.detalhes} />
      ))}
    />
  );
}
