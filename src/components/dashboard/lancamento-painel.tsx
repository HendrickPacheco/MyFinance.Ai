/**
 * Lançamento de gasto no painel desktop — vive dentro de um `Modal` (SPEC
 * 7.1/11: o dono do app pediu que o formulário não ocupe uma faixa fixa na
 * tela; agora ele abre por baixo de "Lançar gasto" na sidebar ou pelo atalho
 * global "N"). Equivalente ao `LancamentoRapido`
 * (`src/components/hoje/lancamento-rapido.tsx`), mas otimizado para TECLADO em
 * vez de toque: o mobile já cobre toque, então aqui não há teclado numérico
 * nem chips — é um formulário normal com Tab/Enter.
 *
 * Fluxo: foco inicial no valor -> digitar valor -> Tab percorre categoria,
 * método, data, descrição -> Enter (em qualquer campo) submete o formulário.
 * Depois de salvar, limpa valor/descrição, MANTÉM categoria/método/data (para
 * lançar vários seguidos da mesma categoria sem tocar no mouse), devolve o
 * foco ao valor e o modal continua aberto pronto para o próximo lançamento.
 *
 * Este componente é montado incondicionalmente pelo `PainelDesktop` — quando
 * fechado, `Modal` não renderiza nada, mas o componente continua de pé para
 * escutar o atalho "N" e o evento de abertura disparado pela sidebar (ver
 * `EVENTO_ABRIR_LANCAMENTO` abaixo). Isso evita dois problemas de
 * arquitetura: (a) a sidebar vive em `app/layout.tsx` e não tem `hoje`/
 * `categoriasLancamento` — só o painel tem; (b) um Context evitaria isso,
 * mas exigiria um provider acima de AMBOS sidebar e painel, ou seja, de novo
 * no layout — sem dados lá para inicializá-lo de forma útil. Um evento de
 * `window` é o canal mais simples entre dois ramos da árvore que não
 * compartilham um ancestral client "dono" dos dados: zero prop drilling,
 * zero estado global novo, e seguindo o mesmo padrão já usado aqui para o
 * atalho de teclado (listener em `window`, sem dependências novas).
 *
 * Atalho global "N" foca o valor (abrindo o modal se preciso) de qualquer
 * lugar do painel. Não dispara dentro de inputs/textarea/select/
 * contentEditable nem com modificadoras (evita colidir com atalhos do
 * navegador/SO).
 *
 * Esc: fecha o modal normalmente SE não há valor digitado. Se há
 * (`centavos > 0`), Esc NÃO descarta silenciosamente — troca o formulário por
 * uma confirmação inline (mesmo padrão de `ConfirmInline` usado em
 * `extrato-variaveis.tsx`) perguntando se quer descartar o rascunho. Mesma
 * regra vale para clique no backdrop e para o botão fechar (X): todos passam
 * pelo mesmo `pedirFechamento`, então o comportamento é único e previsível
 * não importa como o usuário tentou fechar.
 *
 * Regras invioláveis respeitadas aqui:
 * - Dinheiro nunca passa por `Number()`/parseBRL sobre texto livre: o campo
 *   de valor acumula centavos dígito a dígito (mesmo princípio do teclado
 *   numérico do mobile), só que via teclas físicas em vez de botões.
 * - Data civil é sempre string "YYYY-MM-DD"; o default "hoje" vem do
 *   read-model (`EstadoPainel.hoje`), nunca de `new Date()` no cliente.
 * - Sem gamificação: toast de confirmação é só o fato ("Lançado R$ X em Y"),
 *   sem elogio.
 */
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { formatBRL } from '@/shared/dinheiro';
import { cn } from '@/lib/cn';
import { criarTransacao, excluirTransacao } from '@/actions/transacoes';
import { Button, ConfirmInline, Input, Label, Modal, Select } from '@/components/ui';
import { METODO_PAGAMENTO, type MetodoPagamento } from '@/domain/model/enums';
import type { OpcaoCategoria } from '@/application/dashboard-tipos';
import type { DataCivil } from '@/shared/data';

const TETO_CENTAVOS = 99_999_999; // R$ 999.999,99 — mesmo teto do lançamento rápido mobile

/** Evento de `window` que a sidebar dispara para pedir a abertura do modal. */
export const EVENTO_ABRIR_LANCAMENTO = 'financial:abrir-lancamento';

const ROTULO_METODO: Record<MetodoPagamento, string> = {
  PIX: 'Pix',
  DEBITO: 'Débito',
  CREDITO: 'Crédito',
  DINHEIRO: 'Dinheiro',
  BOLETO: 'Boleto',
};

interface ToastState {
  transacaoId: string;
  texto: string;
}

export interface LancamentoPainelProps {
  /** Data civil de hoje, vinda do read-model — nunca de `new Date()` local. */
  hoje: DataCivil;
  /** VARIAVEL primeiro, já ordenadas por frequência de uso — não reordenar. */
  categorias: OpcaoCategoria[];
}

export function LancamentoPainel({ hoje, categorias }: LancamentoPainelProps) {
  const router = useRouter();
  const valorRef = React.useRef<HTMLInputElement>(null);

  const [open, setOpen] = React.useState(false);
  const [confirmandoDescarte, setConfirmandoDescarte] = React.useState(false);

  const [centavos, setCentavos] = React.useState(0);
  const [categoriaId, setCategoriaId] = React.useState(categorias[0]?.id ?? '');
  const [metodo, setMetodo] = React.useState<MetodoPagamento | ''>('');
  const [data, setData] = React.useState<DataCivil>(hoje);
  const [descricao, setDescricao] = React.useState('');

  const [pending, startTransition] = React.useTransition();
  const [erro, setErro] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<ToastState | null>(null);

  const semCategorias = categorias.length === 0;

  // Abre o modal: atalho global "N" (de qualquer tela do painel) e o evento
  // disparado pelo botão "Lançar gasto" da sidebar. Sempre montado — não
  // depende do modal já estar aberto.
  React.useEffect(() => {
    function handleAbrirEvento() {
      setErro(null);
      setConfirmandoDescarte(false);
      setOpen(true);
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== 'n') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const alvo = e.target as HTMLElement | null;
      const tag = alvo?.tagName;
      const digitandoEmCampo =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || alvo?.isContentEditable;
      if (digitandoEmCampo) return;

      e.preventDefault();
      handleAbrirEvento();
    }

    window.addEventListener(EVENTO_ABRIR_LANCAMENTO, handleAbrirEvento);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener(EVENTO_ABRIR_LANCAMENTO, handleAbrirEvento);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const digitar = React.useCallback((d: number) => {
    setErro(null);
    setCentavos((c) => Math.min(c * 10 + d, TETO_CENTAVOS));
  }, []);

  const apagar = React.useCallback(() => {
    setErro(null);
    setCentavos((c) => Math.floor(c / 10));
  }, []);

  // O campo de valor é um input de texto totalmente controlado: só dígitos e
  // Backspace/Delete alteram o valor (acumulando centavos, igual ao teclado
  // numérico do mobile). Teclas de navegação (Tab, Enter, setas, etc.) NUNCA
  // são bloqueadas. Qualquer outra tecla é ignorada para não corromper o
  // valor formatado exibido.
  const handleValorKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const teclasPassagem = [
        'Tab',
        'Shift',
        'Control',
        'Alt',
        'Meta',
        'Enter',
        'Escape',
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Home',
        'End',
        'Delete',
      ];
      if (teclasPassagem.includes(e.key)) {
        if (e.key === 'Delete') {
          e.preventDefault();
          apagar();
        }
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        apagar();
        return;
      }
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        digitar(Number(e.key));
        return;
      }
      // Qualquer outra tecla imprimível: bloqueia (não é um campo de texto livre).
      e.preventDefault();
    },
    [digitar, apagar],
  );

  const handleSubmit = React.useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (centavos <= 0) {
        setErro('Digite um valor maior que zero para lançar.');
        valorRef.current?.focus();
        return;
      }
      if (!categoriaId) {
        setErro('Escolha uma categoria antes de lançar.');
        return;
      }

      const valor = centavos;
      const nomeCategoria = categorias.find((c) => c.id === categoriaId)?.nome ?? '';

      startTransition(async () => {
        const r = await criarTransacao({
          valorCents: valor,
          categoriaId,
          data,
          descricao: descricao.trim() === '' ? null : descricao.trim(),
          metodo: metodo === '' ? null : metodo,
        });
        if (r.ok) {
          setCentavos(0);
          setDescricao('');
          setErro(null);
          setToast({ transacaoId: r.data.id, texto: `${formatBRL(valor)} em ${nomeCategoria}` });
          router.refresh();
          window.setTimeout(() => setToast(null), 5000);
          valorRef.current?.focus();
        } else {
          setErro(r.erro);
        }
      });
    },
    [centavos, categoriaId, categorias, data, descricao, metodo, router],
  );

  const desfazer = React.useCallback(() => {
    if (!toast) return;
    const id = toast.transacaoId;
    setToast(null);
    startTransition(async () => {
      await excluirTransacao(id);
      router.refresh();
    });
  }, [toast, router]);

  // Ponto único de fechamento — Esc, clique no backdrop e o botão "X" do
  // header chamam esta função (via `Modal.onClose` ou diretamente). Se há um
  // valor digitado ainda não salvo, não fecha direto: troca o conteúdo por
  // uma confirmação (mesmo padrão de `ConfirmInline` já usado no extrato).
  const pedirFechamento = React.useCallback(() => {
    if (centavos > 0) {
      setConfirmandoDescarte(true);
      return;
    }
    setOpen(false);
  }, [centavos]);

  const confirmarDescarte = React.useCallback(() => {
    setCentavos(0);
    setErro(null);
    setConfirmandoDescarte(false);
    setOpen(false);
  }, []);

  const cancelarDescarte = React.useCallback(() => setConfirmandoDescarte(false), []);

  return (
    <Modal open={open} onClose={pedirFechamento} ariaLabel="Lançar gasto">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-fg">Lançar gasto</h2>
        <button
          type="button"
          onClick={pedirFechamento}
          aria-label="Fechar"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-4">
        {confirmandoDescarte ? (
          <ConfirmInline
            titulo="Descartar o valor digitado?"
            descricao={`Você digitou ${formatBRL(centavos)} e ainda não salvou este lançamento.`}
            confirmLabel="Descartar"
            cancelLabel="Continuar digitando"
            onConfirm={confirmarDescarte}
            onCancel={cancelarDescarte}
          />
        ) : (
          <>
            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="col-span-2 sm:col-span-1">
                <Label htmlFor="lancamento-valor">Valor</Label>
                <Input
                  ref={valorRef}
                  id="lancamento-valor"
                  data-modal-initial-focus
                  inputMode="numeric"
                  autoComplete="off"
                  value={formatBRL(centavos)}
                  onKeyDown={handleValorKeyDown}
                  onChange={() => {
                    /* controlado só por onKeyDown — evita digitação livre sobre dinheiro */
                  }}
                  className={cn('tnum text-right', centavos > 0 ? 'text-fg' : 'text-faint')}
                  aria-describedby={erro ? 'lancamento-erro' : undefined}
                />
              </div>

              <div>
                <Label htmlFor="lancamento-categoria">Categoria</Label>
                <Select
                  id="lancamento-categoria"
                  value={categoriaId}
                  onChange={(e) => setCategoriaId(e.target.value)}
                  disabled={semCategorias}
                >
                  {semCategorias ? <option value="">Nenhuma cadastrada</option> : null}
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label htmlFor="lancamento-metodo">Método</Label>
                <Select
                  id="lancamento-metodo"
                  value={metodo}
                  onChange={(e) => setMetodo(e.target.value as MetodoPagamento | '')}
                >
                  <option value="">Não informado</option>
                  {METODO_PAGAMENTO.map((m) => (
                    <option key={m} value={m}>
                      {ROTULO_METODO[m]}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label htmlFor="lancamento-data">Data</Label>
                <Input
                  id="lancamento-data"
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                />
              </div>

              <div className="col-span-2 sm:col-span-3">
                <Label htmlFor="lancamento-descricao">Descrição (opcional)</Label>
                <Input
                  id="lancamento-descricao"
                  type="text"
                  maxLength={200}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex.: supermercado, farmácia..."
                />
              </div>

              <div className="col-span-2 flex items-end sm:col-span-1">
                <Button type="submit" disabled={pending || semCategorias} className="w-full">
                  Salvar
                </Button>
              </div>
            </form>

            {erro ? (
              <p id="lancamento-erro" role="alert" className="mt-2 text-sm text-negativo">
                {erro}
              </p>
            ) : null}

            {semCategorias ? (
              <p className="mt-2 text-sm text-muted">
                Nenhuma categoria cadastrada — crie uma em Configuração para lançar gastos.
              </p>
            ) : null}
          </>
        )}
      </div>

      {toast ? (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div className="flex items-center gap-4 rounded-full border border-border-strong bg-surface-2 px-5 py-3 shadow-lg">
            <span className="text-sm text-fg">Lançado {toast.texto}</span>
            <button
              type="button"
              onClick={desfazer}
              className="text-sm font-semibold text-accent hover:underline"
            >
              Desfazer
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
