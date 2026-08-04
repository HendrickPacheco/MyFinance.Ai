'use client';

/**
 * Chat do copiloto (D5).
 *
 * Estado local só de UI (CLAUDE.md regra 6): o histórico vive no estado do
 * React e é reenviado por parâmetro a cada pergunta — nada de `localStorage`
 * como fonte de verdade, e nenhuma persistência. Fechou a aba, acabou a
 * conversa. (A memória persistente é a Fase E, que ainda não existe.)
 *
 * Nenhuma chamada de IA acontece em render: só no submit, por ação explícita.
 * É metade da defesa de custo — a outra metade são os tetos da server action.
 */
import * as React from 'react';
import { CornerDownLeft, Loader2 } from 'lucide-react';
import { Button, Card, CardContent, EmptyState, Input } from '@/components/ui';
import { perguntarCopiloto, type MensagemHistorico } from '@/actions/ia';
import type { RespostaCopiloto } from '@/application/ia/copiloto';
import { RespostaComProveniencia } from './resposta-com-proveniencia';

/**
 * Perguntas de exemplo. São perguntas REAIS que o catálogo de ferramentas
 * cobre — nenhum dado fake na tela (SPEC 13): elas são texto de partida, não
 * resultado inventado.
 */
const EXEMPLOS = [
  'Quanto posso gastar hoje?',
  'Posso parcelar R$ 3.000 em 10x?',
  'Onde eu corto para poupar mais?',
  'O que ainda falta pagar este mês?',
];

interface Turno {
  pergunta: string;
  resposta: RespostaCopiloto | null;
  erro: string | null;
}

export function CopilotoChat() {
  const [turnos, setTurnos] = React.useState<Turno[]>([]);
  const [pergunta, setPergunta] = React.useState('');
  const [pendente, setPendente] = React.useState(false);
  const fimDaLista = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    fimDaLista.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turnos, pendente]);

  const enviar = React.useCallback(
    async (texto: string) => {
      const limpo = texto.trim();
      if (!limpo || pendente) return;

      setPergunta('');
      setPendente(true);
      setTurnos((atuais) => [...atuais, { pergunta: limpo, resposta: null, erro: null }]);

      // Só turnos já respondidos entram no histórico enviado — o loop
      // reconstrói os turnos de ferramenta sozinho a cada pergunta.
      const historico: MensagemHistorico[] = turnos.flatMap((t) =>
        t.resposta
          ? [
              { papel: 'usuario' as const, conteudo: t.pergunta },
              { papel: 'assistente' as const, conteudo: t.resposta.texto },
            ]
          : [],
      );

      const resultado = await perguntarCopiloto({ pergunta: limpo, historico });

      setTurnos((atuais) =>
        atuais.map((turno, i) =>
          i === atuais.length - 1
            ? {
                ...turno,
                resposta: resultado.ok ? resultado.data : null,
                erro: resultado.ok ? null : resultado.erro,
              }
            : turno,
        ),
      );
      setPendente(false);
    },
    [pendente, turnos],
  );

  return (
    <div className="flex flex-col gap-6">
      {turnos.length === 0 ? (
        <EmptyState
          titulo="Pergunte sobre o seu dinheiro"
          descricao="Todo número da resposta vem do motor de cálculo do app, e você vê quais consultas foram feitas."
          acao={
            <div className="flex flex-wrap justify-center gap-2">
              {EXEMPLOS.map((exemplo) => (
                <Button
                  key={exemplo}
                  // Sem isto o default do HTML é "submit" — o botão dispara
                  // qualquer form ancestral em vez de mandar a pergunta.
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void enviar(exemplo)}
                  disabled={pendente}
                >
                  {exemplo}
                </Button>
              ))}
            </div>
          }
        />
      ) : (
        <div className="space-y-4">
          {turnos.map((turno, i) => (
            <div key={i} className="space-y-3">
              <p className="text-sm font-medium text-muted">{turno.pergunta}</p>

              <Card>
                <CardContent className="py-4">
                  {turno.resposta ? (
                    <RespostaComProveniencia resposta={turno.resposta} />
                  ) : turno.erro ? (
                    <p className="text-sm text-negativo">{turno.erro}</p>
                  ) : (
                    <p className="flex items-center gap-2 text-sm text-muted">
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Consultando os seus dados…
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          ))}
          <div ref={fimDaLista} />
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void enviar(pergunta);
        }}
        className="sticky bottom-4 flex gap-2"
      >
        <Input
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          placeholder="Pergunte alguma coisa sobre as suas finanças"
          maxLength={1000}
          disabled={pendente}
          aria-label="Pergunta para o copiloto"
        />
        <Button type="submit" disabled={pendente || pergunta.trim() === ''} aria-label="Enviar">
          {pendente ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <CornerDownLeft className="size-4" aria-hidden />
          )}
        </Button>
      </form>
    </div>
  );
}
