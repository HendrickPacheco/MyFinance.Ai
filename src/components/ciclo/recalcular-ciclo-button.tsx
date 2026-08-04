'use client';

/**
 * Botão discreto "Recalcular ciclo" (SPEC 7). Exige confirmação explícita
 * antes de chamar a action, pois recongela os parâmetros do ciclo e altera
 * o histórico dele.
 */
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';
import { recalcularCicloAtual } from '@/actions/ciclos';
import { usePodeEscrever } from '@/components/auth/ator-contexto';

export function RecalcularCicloButton() {
  // UX: não oferecer ao VIEWER um controle que o servidor recusaria. A trava
  // real é `exigirEscrita` no caso de uso (ver TASKS-AUTH §2.3).
  const podeEscrever = usePodeEscrever();
  if (!podeEscrever) return null;
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [pendente, setPendente] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const confirmar = useCallback(() => {
    setPendente(true);
    setErro(null);
    void recalcularCicloAtual().then((r) => {
      setPendente(false);
      if (r.ok) {
        setConfirmando(false);
        router.refresh();
      } else {
        setErro(r.erro);
      }
    });
  }, [router]);

  if (confirmando) {
    return (
      <div className="rounded-xl border border-atencao/40 bg-atencao/10 p-3 text-right">
        <p className="text-left text-sm text-atencao">
          Isso recongela os parâmetros e ALTERA o histórico deste ciclo.
        </p>
        {erro ? <p className="mt-1 text-left text-sm text-negativo">{erro}</p> : null}
        <div className="mt-2 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pendente}
            onClick={() => setConfirmando(false)}
          >
            Cancelar
          </Button>
          <Button type="button" variant="danger" size="sm" disabled={pendente} onClick={confirmar}>
            Confirmar recálculo
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => setConfirmando(true)}
      aria-label="Recalcular ciclo"
    >
      <RefreshCw size={15} /> Recalcular
    </Button>
  );
}
