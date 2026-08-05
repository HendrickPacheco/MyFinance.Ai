'use client';

/**
 * Tela de auditoria da memória (Fase E, tarefa E7).
 *
 * Por que ela existe: o copiloto passa a carregar planos e preferências em
 * TODA resposta. Sem uma tela para ver e apagar isso, o dono não tem como
 * saber por que uma resposta mudou de tom — a memória vira uma variável
 * oculta. Poder auditar é o que torna a memória aceitável.
 *
 * Arquivar em vez de apagar: reversível, e o histórico de "o que ele já soube"
 * continua consultável.
 */
import * as React from 'react';
import { Archive, Loader2, Plus, RefreshCw, RotateCcw } from 'lucide-react';
import { Badge, Button, Card, CardContent, EmptyState, Input, Select } from '@/components/ui';
import {
  arquivarMemoriaAction,
  criarMemoriaManual,
  reativarMemoriaAction,
  reindexarMemoriasAction,
} from '@/actions/memoria';
import { MAX_CARACTERES_MEMORIA, TIPOS_MEMORIA } from '@/domain/memoria/regras';
import { contemValorMonetario } from '@/domain/memoria/regras';
import type { Memoria } from '@/domain/ports/memoria';

const ROTULO_TIPO: Record<string, string> = {
  PLANO: 'Plano',
  PREFERENCIA: 'Preferência',
  CONTEXTO: 'Contexto',
  CONVERSA: 'Conversa',
};

export function GerenciarMemoria({ iniciais }: { iniciais: Memoria[] }) {
  const [memorias, setMemorias] = React.useState(iniciais);
  const [texto, setTexto] = React.useState('');
  const [tipo, setTipo] = React.useState<string>('PLANO');
  const [pendente, setPendente] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  /**
   * Aviso ANTES de enviar, usando a MESMA função pura que o servidor usa para
   * recusar. Não é validação (essa é do servidor) — é não deixar o dono
   * escrever uma frase inteira para levar um erro no fim.
   */
  const pareceValor = texto.trim() !== '' && contemValorMonetario(texto);

  const enviar = React.useCallback(async () => {
    if (pendente || texto.trim() === '') return;
    setPendente(true);
    setErro(null);

    const resultado = await criarMemoriaManual({ tipo, texto });
    if (resultado.ok) {
      setMemorias((atuais) => [resultado.data, ...atuais]);
      setTexto('');
    } else {
      setErro(resultado.erro);
    }
    setPendente(false);
  }, [pendente, texto, tipo]);

  const [reindexando, setReindexando] = React.useState(false);
  const [reindexResultado, setReindexResultado] = React.useState<string | null>(null);

  const reindexar = React.useCallback(async () => {
    if (reindexando) return;
    setReindexando(true);
    setReindexResultado(null);

    const resultado = await reindexarMemoriasAction();
    if (resultado.ok) {
      const { reindexadas, restantes } = resultado.data;
      setReindexResultado(
        reindexadas === 0 && restantes === 0
          ? 'Nada a reindexar — todas as memórias já estão na busca.'
          : `${reindexadas} reindexada(s)${restantes > 0 ? `, ${restantes} pendente(s) — o teto diário de IA foi atingido, tente amanhã.` : '.'}`,
      );
    } else {
      setErro(resultado.erro);
    }
    setReindexando(false);
  }, [reindexando]);

  const alternarArquivo = React.useCallback(async (memoria: Memoria) => {
    const acao = memoria.ativo ? arquivarMemoriaAction : reativarMemoriaAction;
    const resultado = await acao(memoria.id);
    if (!resultado.ok) {
      setErro(resultado.erro);
      return;
    }
    setMemorias((atuais) =>
      atuais.map((m) => (m.id === memoria.id ? { ...m, ativo: !m.ativo } : m)),
    );
  }, []);

  const ativas = memorias.filter((m) => m.ativo);
  const arquivadas = memorias.filter((m) => !m.ativo);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-3 py-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void enviar();
            }}
            className="flex flex-col gap-2 sm:flex-row"
          >
            <Select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              aria-label="Tipo da memória"
              className="sm:w-44"
            >
              {TIPOS_MEMORIA.map((t) => (
                <option key={t} value={t}>
                  {ROTULO_TIPO[t] ?? t}
                </option>
              ))}
            </Select>
            <Input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ex.: quero sair do aluguel até 2028"
              maxLength={MAX_CARACTERES_MEMORIA}
              aria-label="Texto da memória"
            />
            <Button type="submit" disabled={pendente || texto.trim() === ''}>
              {pendente ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Plus className="size-4" aria-hidden />
              )}
              Guardar
            </Button>
          </form>

          {pareceValor ? (
            <p className="text-sm text-atencao" role="alert">
              Isso parece conter um valor em dinheiro. Memória guarda a intenção — o número de
              hoje é falso amanhã e ninguém percebe. Escreva &quot;quero formar uma reserva&quot;
              em vez do valor.
            </p>
          ) : null}

          {erro ? (
            <p className="text-sm text-negativo" role="alert">
              {erro}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/*
        Reindexação. Existe por causa do backup: o arquivo não carrega os
        vetores (seriam 1536 floats por memória), então memória restaurada
        volta fora da busca semântica até passar por aqui.
      */}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant="outline" onClick={() => void reindexar()} disabled={reindexando}>
          {reindexando ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-4" aria-hidden />
          )}
          Reindexar busca
        </Button>
        {reindexResultado ? (
          <p className="text-sm text-muted" role="status">
            {reindexResultado}
          </p>
        ) : (
          <p className="text-sm text-muted">
            Use depois de importar um backup — os vetores de busca não viajam no arquivo.
          </p>
        )}
      </div>

      {ativas.length === 0 && arquivadas.length === 0 ? (
        <EmptyState
          titulo="O copiloto ainda não lembra de nada"
          descricao="Guarde um plano, uma preferência ou um contexto de vida. Ele passa a considerar isso nas respostas — e você pode arquivar quando quiser."
        />
      ) : (
        <>
          <ListaMemorias titulo="Ativas" itens={ativas} aoAlternar={alternarArquivo} />
          {arquivadas.length > 0 ? (
            <ListaMemorias titulo="Arquivadas" itens={arquivadas} aoAlternar={alternarArquivo} />
          ) : null}
        </>
      )}
    </div>
  );
}

function ListaMemorias({
  titulo,
  itens,
  aoAlternar,
}: {
  titulo: string;
  itens: Memoria[];
  aoAlternar: (memoria: Memoria) => Promise<void>;
}) {
  if (itens.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-muted">
        {titulo} ({itens.length})
      </h2>
      <ul className="space-y-2">
        {itens.map((memoria) => (
          <li
            key={memoria.id}
            className="flex items-start justify-between gap-3 rounded-xl border border-border-strong bg-surface-2 px-4 py-3"
          >
            <div className="space-y-1.5">
              <p className={memoria.ativo ? 'text-sm text-fg' : 'text-sm text-muted line-through'}>
                {memoria.texto}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone="neutral">{ROTULO_TIPO[memoria.tipo] ?? memoria.tipo}</Badge>
                {/* De onde veio: digitada por você ou proposta que você confirmou. */}
                {memoria.origem === 'COPILOTO' ? (
                  <Badge tone="atencao">sugerida pelo copiloto</Badge>
                ) : null}
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void aoAlternar(memoria)}
              aria-label={memoria.ativo ? 'Arquivar memória' : 'Reativar memória'}
            >
              {memoria.ativo ? (
                <>
                  <Archive className="size-4" aria-hidden />
                  Arquivar
                </>
              ) : (
                <>
                  <RotateCcw className="size-4" aria-hidden />
                  Reativar
                </>
              )}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
