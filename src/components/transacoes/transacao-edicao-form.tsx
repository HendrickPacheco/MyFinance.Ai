'use client';

/**
 * Formulário de edição inline de uma `Transacao` — valor, data, categoria e
 * descrição — com o fluxo de confirmação retroativa (CLAUDE.md R2) embutido.
 *
 * Débito do TASKS-CUSTOS §5 item 2: este markup e esta máquina de estados
 * estavam duplicados INTEIROS entre `ciclo/transacao-linha.tsx` e
 * `dashboard/extrato-variaveis.tsx`. `/custos/variaveis` seria a terceira
 * cópia, então a extração vem antes da tela (Fase 9).
 *
 * Contrato do fluxo retroativo, idêntico ao das duas superfícies originais:
 * a action responde `requerConfirmacao` quando a transação toca ciclo já
 * fechado; a UI mostra o aviso e REENVIA com `confirmarRetroativo: true`.
 * Nunca existe caminho de escrita próprio aqui — só `editarTransacao`.
 *
 * O componente renderiza um `<li>` porque as duas listas que o consomem são
 * `<ul>`; quem chama troca a linha pelo formulário no mesmo lugar.
 */
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatBRL, parseBRL } from '@/shared/dinheiro';
import { Button, ConfirmInline, Input, Label, Select } from '@/components/ui';
import { editarTransacao } from '@/actions/transacoes';
import type { DataCivil } from '@/shared/data';
import type { TipoTransacao, TipoVerba } from '@/domain/model/enums';
import { TITULO_RETROATIVO, descricaoRetroativo } from './retroatividade';

/** O mínimo que o `<select>` precisa. Serve tanto `Categoria` quanto `OpcaoCategoria`. */
export interface OpcaoCategoriaEdicao {
  id: string;
  nome: string;
  /** Opcionais: sem eles o seletor de verba não sabe o padrão e fica oculto. */
  grupo?: string;
  tipoVerba?: TipoVerba;
}

/** Dados que habilitam o seletor "Verba" (override de tipo de verba, só DESPESA). */
export interface VerbaEdicao {
  tipo: TipoTransacao;
  ehParcela: boolean;
  override: TipoVerba | null;
}

const ROTULO_VERBA: Record<TipoVerba, string> = { DIA_A_DIA: 'Dia a dia', EXTRA: 'Extra' };

export interface TransacaoEdicaoFormProps {
  transacaoId: string;
  valorCents: number;
  data: DataCivil;
  categoriaId: string | null;
  descricao: string | null;
  categorias: readonly OpcaoCategoriaEdicao[];
  /** Ausente = sem seletor de verba (superfície que ainda não conhece o override). */
  verba?: VerbaEdicao;
  /** Fechar a edição sem salvar. */
  onCancelar: () => void;
  /** Salvou com sucesso; quem chama fecha a edição. O refresh já foi disparado. */
  onSalvo: () => void;
}

export function TransacaoEdicaoForm({
  transacaoId,
  valorCents: valorInicialCents,
  data: dataInicial,
  categoriaId: categoriaIdInicial,
  descricao: descricaoInicial,
  categorias,
  verba,
  onCancelar,
  onSalvo,
}: TransacaoEdicaoFormProps) {
  const router = useRouter();
  const [pendente, setPendente] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /**
   * Confirmação pendente. Guarda o valor JÁ PARSEADO da tentativa que pediu
   * confirmação, como as duas superfícies originais faziam: reenviar é
   * confirmar aquela edição, não reler os campos (que continuam na tela e
   * podem ter sido mexidos enquanto o aviso estava aberto).
   */
  const [confirmacao, setConfirmacao] = useState<{
    valorCents: number;
    ciclosAfetados: string[] | undefined;
  } | null>(null);

  const [valorTexto, setValorTexto] = useState(() => formatBRL(valorInicialCents));
  const [categoriaId, setCategoriaId] = useState(categoriaIdInicial ?? '');
  const [descricao, setDescricao] = useState(descricaoInicial ?? '');
  const [data, setData] = useState(dataInicial);
  // '' = padrão da categoria (override null).
  const [verbaSel, setVerbaSel] = useState<'' | TipoVerba>(verba?.override ?? '');

  const categoriaSel = categorias.find((c) => c.id === categoriaId);
  const mostrarVerba =
    verba?.tipo === 'DESPESA' && categoriaSel?.grupo !== 'FIXO' && !!categoriaSel?.tipoVerba;
  const padraoVerba = ROTULO_VERBA[categoriaSel?.tipoVerba ?? 'EXTRA'];

  const executarEdicao = useCallback(
    async (valorCents: number, confirmarRetroativo: boolean) => {
      setPendente(true);
      setErro(null);
      const r = await editarTransacao(transacaoId, {
        valorCents,
        categoriaId: categoriaId || null,
        descricao: descricao || null,
        data,
        confirmarRetroativo,
        // Só envia quando o seletor existe: ausente = preserva o atual.
        ...(mostrarVerba && !verba?.ehParcela ? { tipoVerbaOverride: verbaSel || null } : {}),
      });
      setPendente(false);
      if (r.ok) {
        setConfirmacao(null);
        onSalvo();
        router.refresh();
        return;
      }
      if (r.requerConfirmacao && !confirmarRetroativo) {
        setConfirmacao({ valorCents, ciclosAfetados: r.ciclosAfetados });
        return;
      }
      setConfirmacao(null);
      setErro(r.erro);
    },
    [transacaoId, categoriaId, descricao, data, mostrarVerba, verba, verbaSel, router, onSalvo],
  );

  /**
   * `parseBRL` é o único parser de dinheiro do app (regra 1). Valor inválido
   * ou não positivo nunca chega na action.
   */
  const valorDigitadoCents = useCallback((): number | null => {
    try {
      const cents = parseBRL(valorTexto);
      if (cents <= 0) {
        setErro('Informe um valor maior que zero.');
        return null;
      }
      return cents;
    } catch {
      setErro('Valor inválido.');
      return null;
    }
  }, [valorTexto]);

  const salvar = useCallback(() => {
    const cents = valorDigitadoCents();
    if (cents === null) return;
    void executarEdicao(cents, false);
  }, [valorDigitadoCents, executarEdicao]);

  const confirmarRetroativo = useCallback(() => {
    if (!confirmacao) return;
    void executarEdicao(confirmacao.valorCents, true);
  }, [confirmacao, executarEdicao]);

  return (
    <li className="rounded-xl border border-border-strong bg-surface-2 p-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`valor-${transacaoId}`}>Valor</Label>
          <Input
            id={`valor-${transacaoId}`}
            inputMode="decimal"
            value={valorTexto}
            onChange={(e) => setValorTexto(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor={`data-${transacaoId}`}>Data</Label>
          <Input
            id={`data-${transacaoId}`}
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-3">
        <Label htmlFor={`categoria-${transacaoId}`}>Categoria</Label>
        <Select
          id={`categoria-${transacaoId}`}
          value={categoriaId}
          onChange={(e) => setCategoriaId(e.target.value)}
        >
          <option value="">Sem categoria</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </Select>
      </div>

      {mostrarVerba ? (
        <div className="mt-3">
          <Label htmlFor={`verba-${transacaoId}`}>Verba</Label>
          <Select
            id={`verba-${transacaoId}`}
            value={verba?.ehParcela ? 'EXTRA' : verbaSel}
            disabled={verba?.ehParcela}
            onChange={(e) => setVerbaSel(e.target.value as '' | TipoVerba)}
          >
            {verba?.ehParcela ? (
              <option value="EXTRA">Extras (parcela)</option>
            ) : (
              <>
                <option value="">Verba: padrão da categoria ({padraoVerba})</option>
                <option value="DIA_A_DIA">Dia a dia</option>
                <option value="EXTRA">Extras</option>
              </>
            )}
          </Select>
        </div>
      ) : null}

      <div className="mt-3">
        <Label htmlFor={`descricao-${transacaoId}`}>Descrição</Label>
        <Input
          id={`descricao-${transacaoId}`}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Opcional"
        />
      </div>

      {erro ? <p className="mt-2 text-sm text-negativo">{erro}</p> : null}

      {confirmacao ? (
        <ConfirmInline
          className="mt-3"
          titulo={TITULO_RETROATIVO}
          descricao={descricaoRetroativo(confirmacao.ciclosAfetados)}
          confirmLabel="Confirmar"
          cancelLabel="Cancelar"
          pendente={pendente}
          onConfirm={confirmarRetroativo}
          onCancel={() => setConfirmacao(null)}
        />
      ) : (
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" disabled={pendente} onClick={onCancelar}>
            Cancelar
          </Button>
          <Button type="button" variant="primary" size="sm" disabled={pendente} onClick={salvar}>
            Salvar
          </Button>
        </div>
      )}
    </li>
  );
}
