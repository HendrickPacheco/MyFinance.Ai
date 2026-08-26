'use client';

/**
 * Controle de anexo de fatura no chat (§15.2 do `TASKS-IMPORTACAO.md`): PDF
 * ou texto colado, sempre com a competência da fatura. A competência é
 * OBRIGATÓRIA antes de enviar — sem ela, "12/03" na fatura não diz o ano, e
 * a conciliação (`conciliarImportacao`) não teria como escolher a janela de
 * busca certa. Por isso o botão de enviar fica desabilitado até o campo
 * estar preenchido, em vez de deixar a rota recusar depois.
 *
 * A extração em si NÃO passa pelo loop de IA do copiloto (custaria um turno
 * de modelo só para ler o documento) — vai direto para `POST /api/importacao`
 * (PDF) ou `colarTextoImportacaoAction` (texto), que extraem e conciliam de
 * uma vez. O resultado sobe para `CopilotoChat` via `onExtraido`, que decide
 * o que fazer com ele (mandar uma pergunta ao copiloto para narrar e propor
 * as linhas, ou só mostrar o aviso de "já importada antes").
 */
import * as React from 'react';
import { FileText, Loader2, Paperclip, X } from 'lucide-react';
import { Button, Input, Segmented } from '@/components/ui';
import { colarTextoImportacaoAction } from '@/actions/importacao';
import type { ResultadoImportacaoConciliada } from '@/application/importacao/conciliar';

const COMPETENCIA_REGEX = /^\d{4}-\d{2}$/;

type Modo = 'PDF' | 'TEXTO';

interface RespostaApiImportacao {
  ok: boolean;
  data?: ResultadoImportacaoConciliada;
  erro?: string;
}

function ehRespostaApiImportacao(valor: unknown): valor is RespostaApiImportacao {
  return typeof valor === 'object' && valor !== null && 'ok' in valor;
}

export interface AnexarFaturaProps {
  onExtraido: (resultado: ResultadoImportacaoConciliada, contexto: { competenciaRef: string }) => void;
  disabled?: boolean;
}

export function AnexarFatura({ onExtraido, disabled = false }: AnexarFaturaProps) {
  const [aberto, setAberto] = React.useState(false);
  const [modo, setModo] = React.useState<Modo>('PDF');
  const [arquivo, setArquivo] = React.useState<File | null>(null);
  const [texto, setTexto] = React.useState('');
  const [competenciaRef, setCompetenciaRef] = React.useState('');
  const [enviando, setEnviando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const inputArquivoRef = React.useRef<HTMLInputElement>(null);

  const competenciaValida = COMPETENCIA_REGEX.test(competenciaRef);
  const temConteudo = modo === 'PDF' ? arquivo !== null : texto.trim().length > 0;
  const podeEnviar = competenciaValida && temConteudo && !enviando;

  const fechar = React.useCallback(() => {
    setAberto(false);
    setArquivo(null);
    setTexto('');
    setErro(null);
  }, []);

  const enviar = React.useCallback(async () => {
    if (!podeEnviar) return;
    setEnviando(true);
    setErro(null);

    try {
      if (modo === 'PDF') {
        if (!arquivo) return;
        const formData = new FormData();
        formData.append('arquivo', arquivo);
        formData.append('competenciaRef', competenciaRef);

        const resposta = await fetch('/api/importacao', { method: 'POST', body: formData });
        const json: unknown = await resposta.json();
        if (!ehRespostaApiImportacao(json) || !json.ok || !json.data) {
          setErro(ehRespostaApiImportacao(json) && json.erro ? json.erro : 'Falha ao importar a fatura.');
          return;
        }
        onExtraido(json.data, { competenciaRef });
      } else {
        const resultado = await colarTextoImportacaoAction({ texto, competenciaRef });
        if (!resultado.ok) {
          setErro(resultado.erro);
          return;
        }
        onExtraido(resultado.data, { competenciaRef });
      }
      fechar();
    } finally {
      setEnviando(false);
    }
  }, [podeEnviar, modo, arquivo, competenciaRef, texto, onExtraido, fechar]);

  if (!aberto) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setAberto(true)}
        disabled={disabled}
      >
        <Paperclip className="size-4" aria-hidden />
        Anexar fatura
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-border-strong bg-surface-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-fg">Anexar fatura</p>
        <Button type="button" variant="ghost" size="sm" onClick={fechar} disabled={enviando} aria-label="Cancelar anexo">
          <X className="size-4" aria-hidden />
        </Button>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        <Segmented
          ariaLabel="Como anexar a fatura"
          valor={modo}
          onChange={(v) => {
            setModo(v);
            setErro(null);
          }}
          opcoes={[
            { value: 'PDF', label: 'Anexar PDF' },
            { value: 'TEXTO', label: 'Colar texto' },
          ]}
        />

        <div>
          <label htmlFor="anexar-fatura-competencia" className="mb-1.5 block text-sm text-muted">
            Competência da fatura <span className="text-negativo">*</span>
          </label>
          <Input
            id="anexar-fatura-competencia"
            type="month"
            value={competenciaRef}
            onChange={(e) => setCompetenciaRef(e.target.value)}
            disabled={enviando}
            required
            aria-required="true"
            className="max-w-[180px]"
          />
          <p className="mt-1 text-xs text-muted">
            Obrigatória: sem ela, uma data como &quot;12/03&quot; impressa na fatura não diz o ano.
          </p>
        </div>

        {modo === 'PDF' ? (
          <div>
            <label htmlFor="anexar-fatura-arquivo" className="mb-1.5 block text-sm text-muted">
              Arquivo PDF
            </label>
            <input
              ref={inputArquivoRef}
              id="anexar-fatura-arquivo"
              type="file"
              accept="application/pdf"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
              disabled={enviando}
              className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-border-strong file:bg-surface file:px-3 file:py-2 file:text-sm file:text-fg file:hover:bg-surface-2"
            />
            {arquivo ? (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                <FileText className="size-3.5" aria-hidden />
                {arquivo.name}
              </p>
            ) : null}
          </div>
        ) : (
          <div>
            <label htmlFor="anexar-fatura-texto" className="mb-1.5 block text-sm text-muted">
              Texto da fatura
            </label>
            <textarea
              id="anexar-fatura-texto"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              disabled={enviando}
              rows={6}
              maxLength={500_000}
              placeholder="Cole aqui o texto copiado da fatura"
              className="w-full rounded-xl border border-border-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none"
            />
          </div>
        )}

        {erro ? (
          <p className="text-sm text-negativo" role="alert">
            {erro}
          </p>
        ) : null}

        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={() => void enviar()} disabled={!podeEnviar}>
            {enviando ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Lendo e conciliando (pode levar até 40s)…
              </>
            ) : (
              'Enviar fatura'
            )}
          </Button>
          {!enviando ? (
            <Button type="button" size="sm" variant="ghost" onClick={fechar}>
              Cancelar
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
