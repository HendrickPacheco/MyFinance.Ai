/**
 * Modal "Nova compra parcelada" do painel desktop — segundo caminho para criar
 * um parcelamento (o primeiro é o copiloto propor e o dono confirmar). Mesma
 * estrutura do `LancamentoPainel` (modal sempre montado, abre por evento de
 * `window`, campo de valor por acumulação de dígitos, mesmo padrão de
 * estado/erro/pending), só que chamando `criarParcelamento` em vez de
 * `criarTransacao`.
 *
 * Fica montado incondicionalmente dentro de `PainelDesktop` (mesmo motivo do
 * `LancamentoPainel`: é ali que `hoje`/`categoriasLancamento` existem) e o
 * botão que abre mora no header do card `ParceladosLista`, que é Server
 * Component — por isso a abertura viaja por um evento de `window`
 * (`EVENTO_ABRIR_PARCELAMENTO`) em vez de estado compartilhado.
 *
 * Regras respeitadas aqui:
 * - Dinheiro nunca passa por `Number()`/parseBRL sobre texto livre: o valor
 *   total acumula centavos dígito a dígito, igual ao `LancamentoPainel`.
 * - O rateio das parcelas é decisão do domínio (`gerarParcelas`, floor com
 *   resto na última) — este componente não calcula nada, só mostra o total
 *   digitado e o número de parcelas; sem prévia por parcela.
 * - Data civil é sempre string "YYYY-MM-DD"; o default "hoje" vem do
 *   read-model (`EstadoPainel.hoje`), nunca de `new Date()` no cliente.
 * - D-11: parcela consome o teto diário como qualquer gasto e NÃO reduz a
 *   verba — nenhum texto aqui sugere o contrário.
 */
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { formatBRL } from '@/shared/dinheiro';
import { cn } from '@/lib/cn';
import { criarParcelamento } from '@/actions/transacoes';
import { Button, Input, Label, Modal, Select } from '@/components/ui';
import { METODO_PAGAMENTO, type MetodoPagamento } from '@/domain/model/enums';
import type { OpcaoCategoria } from '@/application/dashboard-tipos';
import type { DataCivil } from '@/shared/data';
import { usePodeEscrever } from '@/components/auth/ator-contexto';

const TETO_CENTAVOS = 99_999_999; // R$ 999.999,99 — mesmo teto do lançamento de gasto
const MIN_PARCELAS = 2;
const MAX_PARCELAS = 72;

/** Evento de `window` que o botão do card dispara para pedir a abertura do modal. */
export const EVENTO_ABRIR_PARCELAMENTO = 'financial:abrir-parcelamento';

const ROTULO_METODO: Record<MetodoPagamento, string> = {
  PIX: 'Pix',
  DEBITO: 'Débito',
  CREDITO: 'Crédito',
  DINHEIRO: 'Dinheiro',
  BOLETO: 'Boleto',
};

export interface ParcelamentoModalProps {
  /** Data civil de hoje, vinda do read-model — nunca de `new Date()` local. */
  hoje: DataCivil;
  /** VARIAVEL primeiro, já ordenadas por frequência de uso — não reordenar. */
  categorias: OpcaoCategoria[];
}

export function ParcelamentoModal({ hoje, categorias }: ParcelamentoModalProps) {
  // Mesma trava de UX do LancamentoPainel: esconder o botão não protege nada
  // (a trava real é `exigirEscrita` no caso de uso), isto só evita oferecer a
  // um VIEWER um formulário que o servidor vai recusar.
  const podeEscrever = usePodeEscrever();
  if (!podeEscrever) return null;
  const router = useRouter();
  const valorRef = React.useRef<HTMLInputElement>(null);
  const descricaoRef = React.useRef<HTMLInputElement>(null);

  const [open, setOpen] = React.useState(false);
  const [centavos, setCentavos] = React.useState(0);
  const [descricao, setDescricao] = React.useState('');
  const [numParcelas, setNumParcelas] = React.useState('2');
  const [categoriaId, setCategoriaId] = React.useState(categorias[0]?.id ?? '');
  const [metodo, setMetodo] = React.useState<MetodoPagamento | ''>('');
  const [dataCompra, setDataCompra] = React.useState<DataCivil>(hoje);

  const [pending, startTransition] = React.useTransition();
  const [erro, setErro] = React.useState<string | null>(null);

  const semCategorias = categorias.length === 0;

  React.useEffect(() => {
    function handleAbrirEvento() {
      setErro(null);
      setOpen(true);
    }
    window.addEventListener(EVENTO_ABRIR_PARCELAMENTO, handleAbrirEvento);
    return () => window.removeEventListener(EVENTO_ABRIR_PARCELAMENTO, handleAbrirEvento);
  }, []);

  const resetarFormulario = React.useCallback(() => {
    setCentavos(0);
    setDescricao('');
    setNumParcelas('2');
    setDataCompra(hoje);
    setMetodo('');
    setErro(null);
  }, [hoje]);

  const digitar = React.useCallback((d: number) => {
    setErro(null);
    setCentavos((c) => Math.min(c * 10 + d, TETO_CENTAVOS));
  }, []);

  const apagar = React.useCallback(() => {
    setErro(null);
    setCentavos((c) => Math.floor(c / 10));
  }, []);

  // Mesmo campo de valor totalmente controlado do LancamentoPainel: só
  // dígitos e Backspace/Delete alteram o valor; navegação nunca é bloqueada.
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
      e.preventDefault();
    },
    [digitar, apagar],
  );

  const fechar = React.useCallback(() => {
    setOpen(false);
  }, []);

  const handleSubmit = React.useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (descricao.trim() === '') {
        setErro('Descreva a compra.');
        descricaoRef.current?.focus();
        return;
      }
      if (centavos <= 0) {
        setErro('Digite um valor total maior que zero.');
        valorRef.current?.focus();
        return;
      }
      const n = Number(numParcelas);
      if (!Number.isInteger(n) || n < MIN_PARCELAS || n > MAX_PARCELAS) {
        setErro(`Número de parcelas deve ser entre ${MIN_PARCELAS} e ${MAX_PARCELAS}.`);
        return;
      }
      if (!categoriaId) {
        setErro('Escolha uma categoria antes de salvar.');
        return;
      }

      startTransition(async () => {
        const r = await criarParcelamento({
          descricao: descricao.trim(),
          valorTotalCents: centavos,
          numParcelas: n,
          dataCompra,
          categoriaId,
          metodo: metodo === '' ? null : metodo,
        });
        if (r.ok) {
          resetarFormulario();
          setOpen(false);
          router.refresh();
        } else {
          setErro(r.erro);
        }
      });
    },
    [descricao, centavos, numParcelas, categoriaId, metodo, dataCompra, resetarFormulario, router],
  );

  return (
    <Modal open={open} onClose={fechar} ariaLabel="Nova compra parcelada">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-fg">Nova compra parcelada</h2>
        <button
          type="button"
          onClick={fechar}
          aria-label="Fechar"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label htmlFor="parcelamento-descricao">Descrição</Label>
          <Input
            ref={descricaoRef}
            id="parcelamento-descricao"
            data-modal-initial-focus
            type="text"
            maxLength={200}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex.: notebook, geladeira..."
            aria-describedby={erro ? 'parcelamento-erro' : undefined}
          />
        </div>

        <div>
          <Label htmlFor="parcelamento-valor">Valor total</Label>
          <Input
            ref={valorRef}
            id="parcelamento-valor"
            inputMode="numeric"
            autoComplete="off"
            value={formatBRL(centavos)}
            onKeyDown={handleValorKeyDown}
            onChange={() => {
              /* controlado só por onKeyDown — evita digitação livre sobre dinheiro */
            }}
            className={cn('tnum text-right', centavos > 0 ? 'text-fg' : 'text-faint')}
          />
        </div>

        <div>
          <Label htmlFor="parcelamento-num">Nº de parcelas</Label>
          <Input
            id="parcelamento-num"
            type="number"
            min={MIN_PARCELAS}
            max={MAX_PARCELAS}
            step={1}
            inputMode="numeric"
            value={numParcelas}
            onChange={(e) => setNumParcelas(e.target.value)}
            className="tnum"
          />
        </div>

        <div>
          <Label htmlFor="parcelamento-categoria">Categoria</Label>
          <Select
            id="parcelamento-categoria"
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
          <Label htmlFor="parcelamento-metodo">Método</Label>
          <Select
            id="parcelamento-metodo"
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

        <div className="col-span-2">
          <Label htmlFor="parcelamento-data">Data da compra</Label>
          <Input
            id="parcelamento-data"
            type="date"
            value={dataCompra}
            onChange={(e) => setDataCompra(e.target.value)}
          />
        </div>

        <div className="col-span-2 mt-1 flex justify-end">
          <Button type="submit" disabled={pending || semCategorias}>
            Salvar parcelamento
          </Button>
        </div>
      </form>

      {erro ? (
        <p id="parcelamento-erro" role="alert" className="mt-2 text-sm text-negativo">
          {erro}
        </p>
      ) : null}

      {semCategorias ? (
        <p className="mt-2 text-sm text-muted">
          Nenhuma categoria cadastrada — crie uma em Configuração para lançar parcelamentos.
        </p>
      ) : null}
    </Modal>
  );
}
