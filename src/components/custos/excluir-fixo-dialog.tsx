'use client';

import { ConfirmDialog } from '@/components/ui';
import { formatBRL } from '@/shared/dinheiro';

export interface ExclusaoBloqueada {
  nome: string;
  /** `custo` conta ciclos com pagamento; `provisao` conta dinheiro já reservado. */
  motivo:
    | { tipo: 'pagamentos'; ciclosComPagamento: number }
    | { tipo: 'acumulado'; acumuladoCents: number };
}

export interface ExcluirFixoDialogProps {
  alvo: ExclusaoBloqueada | null;
  pendente: boolean;
  onDesativar: () => void;
  onCancelar: () => void;
}

/**
 * Diálogo de exclusão BLOQUEADA (TASKS-CUSTOS §4.1).
 *
 * A versão original do plano prometia um botão "Excluir para sempre" que
 * funcionaria "apesar dos 7 ciclos fechados". Esse botão é impossível: a FK
 * `PagamentoFixo.custoFixoId` é `Restrict`, então ele falharia 100% das vezes.
 * Prometer na UI uma ação que o banco recusa é pior que não oferecê-la — por
 * isso aqui existe uma saída só, e ela é a segura: `[Cancelar] [Desativar]`.
 *
 * As contagens vêm do SERVIDOR (`ciclosComPagamento` do read-model,
 * `acumuladoCents` do cadastro), nunca estimadas no cliente. O foco inicial vai
 * para "Cancelar" — a primitiva `ConfirmDialog` já garante isso.
 */
export function ExcluirFixoDialog({
  alvo,
  pendente,
  onDesativar,
  onCancelar,
}: ExcluirFixoDialogProps) {
  if (!alvo) {
    // `open={false}` seria equivalente, mas montar o Modal fechado com um alvo
    // nulo obrigaria a inventar textos vazios — melhor não renderizar.
    return null;
  }

  const pagamentos = alvo.motivo.tipo === 'pagamentos' ? alvo.motivo : null;

  return (
    <ConfirmDialog
      open
      tone="neutral"
      titulo={`“${alvo.nome}” não pode ser excluída.`}
      consequencia={
        pagamentos ? (
          <>
            <p className="tnum">
              Ela está marcada como paga em <strong>{pagamentos.ciclosComPagamento}</strong>{' '}
              {pagamentos.ciclosComPagamento === 1 ? 'ciclo' : 'ciclos'}, e apagar o cadastro
              deixaria esses pagamentos órfãos.
            </p>
            <p>
              Desative para que ela pare de entrar no cálculo da verba — o histórico continua
              intacto.
            </p>
          </>
        ) : (
          <>
            <p className="tnum">
              Ela tem{' '}
              <strong>
                {formatBRL(
                  alvo.motivo.tipo === 'acumulado' ? alvo.motivo.acumuladoCents : 0,
                )}
              </strong>{' '}
              já acumulados, e apagar o cadastro jogaria fora dinheiro que você reservou.
            </p>
            <p>
              Desative para que ela pare de entrar no cálculo da verba — o acumulado continua onde
              está.
            </p>
          </>
        )
      }
      confirmLabel="Desativar"
      cancelLabel="Cancelar"
      pendente={pendente}
      onConfirm={onDesativar}
      onCancel={onCancelar}
    />
  );
}
