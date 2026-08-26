'use client';

/**
 * Chat do copiloto (D5), com sessões de conversa (Fase 3).
 *
 * Estado local de UI (CLAUDE.md regra 6): os turnos AO VIVO desta montagem
 * vivem no `useState` do React. O histórico de turnos ANTERIORES vem de
 * `mensagensIniciais` (carregado pelo painel via `abrirConversaIA`) — não é
 * `localStorage`, é o que o servidor devolveu para esta conversa.
 *
 * Nenhuma chamada de IA acontece em render: só no submit, por ação explícita.
 * É metade da defesa de custo — a outra metade são os tetos da server action.
 *
 * ─── POR QUE ESTE COMPONENTE REMONTA AO TROCAR DE CONVERSA ───
 *
 * `CopilotoPainel` (o pai) usa `key` para remontar este componente sempre que
 * o usuário troca de conversa ou pede uma nova — de propósito. Assim o estado
 * de turnos ao vivo nunca vaza de uma conversa para outra, e este componente
 * não precisa reagir a mudanças de `conversaIdInicial`/`mensagensIniciais`
 * depois do mount: ele só as lê uma vez, no `useState` inicial.
 */
import * as React from 'react';
import { CornerDownLeft, Loader2 } from 'lucide-react';
import { Button, Card, CardContent, EmptyState, Input } from '@/components/ui';
import { perguntarCopiloto } from '@/actions/ia';
import type { RespostaCopiloto } from '@/application/ia/copiloto';
import type { MensagemConversa } from '@/domain/model/entidades';
import type { ResultadoImportacaoConciliada } from '@/application/importacao/conciliar';
import { RespostaComProveniencia, RespostaHistorico } from './resposta-com-proveniencia';
import { AnexarFatura } from './anexar-fatura';

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

/**
 * `PERGUNTA` é o turno de sempre: pergunta do dono → resposta do modelo (ou
 * erro). `AVISO` é um turno LOCAL, que nunca passa pelo loop de IA — usado só
 * para o caso "esta fatura já foi importada antes" (`tipo: 'JA_CONFIRMADA'`
 * em `ResultadoImportacaoConciliada`), onde o app já sabe a resposta sem
 * gastar um turno de modelo para relatar o óbvio (defesa de custo, ver
 * docblock de `actions/ia.ts`).
 */
type Turno =
  | { tipo: 'PERGUNTA'; pergunta: string; resposta: RespostaCopiloto | null; erro: string | null }
  | { tipo: 'AVISO'; texto: string };

/**
 * Agrupa as mensagens carregadas do banco em pares pergunta/resposta. A
 * gravação (`anexarTurno`) sempre grava as duas mensagens de um turno juntas,
 * na ordem usuário → assistente, então parear por índice é seguro — não é uma
 * suposição frágil, é o mesmo invariante que a escrita garante.
 */
interface TurnoHistorico {
  id: string;
  pergunta: string;
  resposta: MensagemConversa | null;
}

function agruparEmTurnos(mensagens: MensagemConversa[]): TurnoHistorico[] {
  const turnos: TurnoHistorico[] = [];
  for (let i = 0; i < mensagens.length; i += 1) {
    const atual = mensagens[i];
    if (!atual || atual.papel !== 'usuario') continue;
    const proxima = mensagens[i + 1];
    turnos.push({
      id: atual.id,
      pergunta: atual.conteudo,
      resposta: proxima && proxima.papel === 'assistente' ? proxima : null,
    });
  }
  return turnos;
}

export interface CopilotoChatProps {
  /** `null` = esta montagem começa sem conversa — nasce no banco após a 1ª resposta. */
  conversaIdInicial: string | null;
  /** Mensagens já persistidas desta conversa (vazio para conversa nova). */
  mensagensIniciais: MensagemConversa[];
  /**
   * Chamado depois de cada resposta bem-sucedida, com o id da conversa usada
   * (a mesma que entrou, ou a recém-criada). O painel usa isto para destacar a
   * conversa certa na lista e recarregar a lista (título/`atualizadaEm` novos)
   * — sem forçar remontagem deste chat (ver comentário no topo do arquivo).
   */
  onTurnoConcluido: (conversaId: string) => void;
}

export function CopilotoChat({ conversaIdInicial, mensagensIniciais, onTurnoConcluido }: CopilotoChatProps) {
  // Turnos históricos são fixos nesta montagem — vieram prontos do painel e
  // não mudam enquanto o usuário conversa (os novos turnos entram em `turnos`,
  // nunca aqui).
  const [turnosHistoricos] = React.useState(() => agruparEmTurnos(mensagensIniciais));
  const [turnos, setTurnos] = React.useState<Turno[]>([]);
  const [pergunta, setPergunta] = React.useState('');
  const [pendente, setPendente] = React.useState(false);
  const fimDaLista = React.useRef<HTMLDivElement>(null);
  // Id da conversa desta sessão de chat. Começa com o que o painel passou e
  // passa a apontar para a conversa recém-criada depois da 1ª resposta — sem
  // isto, a 2ª pergunta de uma conversa nova mandaria `conversaId: null` de
  // novo e criaria uma SEGUNDA conversa em vez de continuar a primeira.
  const conversaIdRef = React.useRef(conversaIdInicial);

  React.useEffect(() => {
    fimDaLista.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turnos, pendente]);

  const enviar = React.useCallback(
    async (texto: string) => {
      const limpo = texto.trim();
      if (!limpo || pendente) return;

      setPergunta('');
      setPendente(true);
      setTurnos((atuais) => [...atuais, { tipo: 'PERGUNTA', pergunta: limpo, resposta: null, erro: null }]);

      const resultado = await perguntarCopiloto({ conversaId: conversaIdRef.current, pergunta: limpo });

      setTurnos((atuais) =>
        atuais.map((turno, i) =>
          i === atuais.length - 1 && turno.tipo === 'PERGUNTA'
            ? {
                ...turno,
                resposta: resultado.ok ? resultado.data.resposta : null,
                erro: resultado.ok ? null : resultado.erro,
              }
            : turno,
        ),
      );
      setPendente(false);

      if (resultado.ok) {
        conversaIdRef.current = resultado.data.conversaId;
        onTurnoConcluido(resultado.data.conversaId);
      }
    },
    [pendente, onTurnoConcluido],
  );

  /**
   * Chamado por `AnexarFatura` depois que a extração+conciliação terminou
   * (fora do loop de IA — ver docblock do componente). Dois destinos:
   *
   *  - `JA_CONFIRMADA`: nada para o copiloto narrar, ele nem tem ferramenta
   *    para isto — vira um turno `AVISO` local, sem gastar um turno de IA.
   *  - `RASCUNHO`: manda uma pergunta normal ao copiloto com o id do
   *    rascunho, para ele chamar `conciliar_importacao`/`propor_importacao`
   *    (catálogo de ferramentas) e narrar + propor as linhas — reaproveita
   *    o `enviar` de sempre, então esta importação também fica salva no
   *    histórico da conversa como qualquer outro turno.
   */
  const aoExtrairFatura = React.useCallback(
    (resultado: ResultadoImportacaoConciliada, contexto: { competenciaRef: string }) => {
      if (resultado.tipo === 'JA_CONFIRMADA') {
        setTurnos((atuais) => [...atuais, { tipo: 'AVISO', texto: resultado.mensagem }]);
        return;
      }
      void enviar(
        `Anexei a fatura de competência ${contexto.competenciaRef}. Id da importação: ${resultado.importacaoId}. ` +
          'Mostra as linhas para eu revisar.',
      );
    },
    [enviar],
  );

  const semNadaNaTela = turnosHistoricos.length === 0 && turnos.length === 0;

  return (
    <div className="flex flex-col gap-6">
      {semNadaNaTela ? (
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
          {turnosHistoricos.map((turno) => (
            <div key={turno.id} className="space-y-3">
              <p className="text-sm font-medium text-muted">{turno.pergunta}</p>
              <Card>
                <CardContent className="py-4">
                  {turno.resposta ? (
                    <RespostaHistorico
                      conteudo={turno.resposta.conteudo}
                      proveniencia={turno.resposta.proveniencia}
                    />
                  ) : (
                    // Turno gravado sem a mensagem de assistente correspondente
                    // não deveria existir (`anexarTurno` grava as duas juntas),
                    // mas se acontecer é melhor mostrar isto do que travar a tela.
                    <p className="text-sm text-muted">Resposta indisponível.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          ))}

          {turnos.map((turno, i) =>
            turno.tipo === 'AVISO' ? (
              <p key={i} className="text-sm text-muted">
                {turno.texto}
              </p>
            ) : (
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
            ),
          )}
          <div ref={fimDaLista} />
        </div>
      )}

      <div className="flex justify-start">
        <AnexarFatura onExtraido={aoExtrairFatura} disabled={pendente} />
      </div>

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
