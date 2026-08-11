'use client';

import { ConfirmDialog } from '@/components/ui';
import type { GrupoDeParcelas, PreviaEncerramento } from '@/application/parcelamentos';
import { formatBRL } from '@/shared/dinheiro';
import { formatarMesAno } from '@/shared/data';

/** "03–09/2026" quando o grupo cabe num ano, "10/2026–02/2027" quando não. */
function periodoDoGrupo(grupo: GrupoDeParcelas): string {
  if (!grupo.primeiraEm || !grupo.ultimaEm) return '';
  const de = formatarMesAno(grupo.primeiraEm);
  const ate = formatarMesAno(grupo.ultimaEm);
  return de === ate ? de : `${de} – ${ate}`;
}

function LinhaGrupo({
  marcador,
  rotulo,
  grupo,
}: {
  marcador: string;
  rotulo: string;
  grupo: GrupoDeParcelas;
}) {
  if (grupo.quantidade === 0) return null;
  return (
    <li className="tnum flex flex-wrap items-baseline gap-x-2">
      <span aria-hidden>{marcador}</span>
      <span className="text-fg">
        {grupo.quantidade} {grupo.quantidade === 1 ? 'parcela' : 'parcelas'} {rotulo}
      </span>
      <span className="text-fg">{formatBRL(grupo.valorCents)}</span>
      <span className="text-faint">({periodoDoGrupo(grupo)})</span>
    </li>
  );
}

export interface EncerrarParcelamentoDialogProps {
  /** `null` fecha o diálogo. A prévia SEMPRE vem do servidor. */
  previa: PreviaEncerramento | null;
  pendente: boolean;
  /**
   * Segundo passo do §4.2/R2: alguma parcela a cancelar caiu em ciclo fechado
   * e o servidor recusou sem confirmação. A consequência muda, e o rótulo do
   * botão também.
   */
  ciclosAfetados: readonly string[] | null;
  onConfirmar: () => void;
  onCancelar: () => void;
}

/**
 * Diálogo de cancelamento das parcelas futuras (TASKS-CUSTOS §4.2).
 *
 * O que este componente NÃO faz, e não pode passar a fazer:
 * - **não estima nada.** Contagens, somas e meses vêm de
 *   `previaEncerramentoParcelamento`, que usa a MESMA partição
 *   (`particionarParcelas`) que o encerramento vai usar. Recalcular aqui
 *   produziria um diálogo que promete 5 e uma ação que cancela 4.
 * - **não promete desfazer.** Sem toast de undo: as parcelas são apagadas de
 *   verdade, e oferecer "desfazer" seria mentira.
 *
 * O rótulo do botão diz o que vai acontecer ("Cancelar 5 futuras"), nunca
 * "Confirmar", e o foco inicial vai para "Voltar" — a primitiva
 * `ConfirmDialog` garante o foco, este componente garante o rótulo.
 */
export function EncerrarParcelamentoDialog({
  previa,
  pendente,
  ciclosAfetados,
  onConfirmar,
  onCancelar,
}: EncerrarParcelamentoDialogProps) {
  if (!previa) return null;

  const { aCancelar, pagas, preservadas } = previa;
  const nada = aCancelar.quantidade === 0;
  const retroativo = ciclosAfetados != null && ciclosAfetados.length > 0;

  // Sem nada a cancelar o diálogo vira informativo, com saída única. Mostrar
  // "Cancelar 0 futuras" seria oferecer um botão que não faz nada.
  const confirmLabel = nada
    ? 'Entendi'
    : retroativo
      ? `Cancelar ${aCancelar.quantidade} e recalcular`
      : `Cancelar ${aCancelar.quantidade} ${aCancelar.quantidade === 1 ? 'futura' : 'futuras'}`;

  return (
    <ConfirmDialog
      open
      tone={nada ? 'neutral' : 'negativo'}
      titulo={
        nada
          ? `Nada a cancelar em “${previa.descricao}”.`
          : `Cancelar as parcelas futuras de “${previa.descricao}”?`
      }
      consequencia={
        <>
          <p className="tnum">
            {previa.numParcelas}× · compra em {formatarMesAno(previa.dataCompra)} ·{' '}
            {formatBRL(previa.valorTotalCents)}
          </p>

          <ul className="space-y-1">
            <LinhaGrupo marcador="●" rotulo="já pagas" grupo={pagas} />
            <LinhaGrupo marcador="○" rotulo="a vencer" grupo={aCancelar} />
            <LinhaGrupo marcador="◆" rotulo="preservadas" grupo={preservadas} />
          </ul>

          {preservadas.quantidade > 0 ? (
            // Sem esta frase o dono soma 7 + 5 e não fecha 12 — e conclui que
            // a tela está errada. "Preservada" é vencida-e-não-marcada ou de
            // ciclo fechado; nos dois casos o gasto provavelmente já caiu.
            <p className="text-xs">
              As preservadas já venceram (ou estão em ciclo fechado) e continuam no histórico —
              cancelá-las faria gasto que já caiu no cartão desaparecer.
            </p>
          ) : null}

          {nada ? (
            <p>
              Não há parcela futura em ciclo aberto para cancelar. O que existe é história e
              continua como está.
            </p>
          ) : (
            <p>
              As {aCancelar.quantidade} futuras somem. O que você já pagou continua no histórico e
              nos ciclos fechados.
              {previa.alivioMensalCents != null && previa.alivioAPartirDe ? (
                <>
                  {' '}
                  Sua verba livre sobe{' '}
                  <strong className="tnum">{formatBRL(previa.alivioMensalCents)}</strong>/mês a
                  partir de <strong className="tnum">{formatarMesAno(previa.alivioAPartirDe)}</strong>
                  .
                </>
              ) : null}
            </p>
          )}

          {retroativo ? (
            <p className="text-atencao">
              Esta transação pertence a um ciclo já fechado ({ciclosAfetados.length}{' '}
              {ciclosAfetados.length === 1 ? 'ciclo' : 'ciclos'}). Confirme para recalcular a sobra
              desse ciclo.
            </p>
          ) : null}

          {/* Sem promessa de desfazer — §4.2. */}
          <p className="text-xs text-faint">Não dá para desfazer.</p>
        </>
      }
      confirmLabel={confirmLabel}
      cancelLabel={nada ? 'Fechar' : 'Voltar'}
      pendente={pendente}
      onConfirm={nada ? onCancelar : onConfirmar}
      onCancel={onCancelar}
    />
  );
}
