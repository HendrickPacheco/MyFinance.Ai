'use client';

/**
 * Duas ações explícitas sobre a renda do ciclo (D7, D8), ambas com prévia
 * antes de gravar: recalcular a prevista e confirmar a real. Nenhuma conta
 * mora aqui — a prévia vem do caso de uso.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Checkbox, Input, Label, Modal } from '@/components/ui';
import { MoneyInput } from '@/components/fechar-ciclo/money-input';
import { usePodeEscrever } from '@/components/auth/ator-contexto';
import {
  confirmarRendaRealAction,
  previaRecalculoRendaAction,
  previaRendaRealAction,
  recalcularRendaAction,
  type RendaRealEntrada,
} from '@/actions/ciclos';
import type { ImpactoRenda, PreviaConfirmacaoRenda } from '@/application/renda-ciclo';
import { formatBRL, parseBRL } from '@/shared/dinheiro';
import type { MoedaRenda } from '@/domain/model/enums';

function Previa({ p }: { p: ImpactoRenda | PreviaConfirmacaoRenda }) {
  const linhas: [string, number, number][] = [
    ['Renda', p.rendaAntesCents, p.rendaDepoisCents],
    ['Verba variável', p.verbaAntesCents, p.verbaDepoisCents],
    ['Dia a dia por dia', p.diaADiaDiarioAntesCents, p.diaADiaDiarioDepoisCents],
    ['Extras', p.extrasAntesCents, p.extrasDepoisCents],
  ];
  const lanc = 'lancamento' in p ? p.lancamento : null;
  return (
    <div className="space-y-2 text-sm">
      <ul className="space-y-1">
        {linhas.map(([rotulo, antes, depois]) => (
          <li key={rotulo} className="flex justify-between gap-3">
            <span className="text-muted">{rotulo}</span>
            <span className="tnum text-fg">
              {formatBRL(antes)} → {formatBRL(depois)}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-faint">{p.decomposicao}</p>
      {p.aviso ? <p className="text-atencao">{p.aviso}</p> : null}
      {lanc ? (
        <p className="text-fg">
          Será lançada uma renda de {formatBRL(lanc.valorCents)} em {lanc.data.split('-').reverse().join('/')} (
          {lanc.descricao}).
        </p>
      ) : null}
    </div>
  );
}

function Rodape({
  onCancelar,
  onConfirmar,
  pendente,
  podeConfirmar,
  rotulo,
}: {
  onCancelar: () => void;
  onConfirmar: () => void;
  pendente: boolean;
  podeConfirmar: boolean;
  rotulo: string;
}) {
  return (
    <div className="mt-4 flex justify-end gap-2">
      <Button type="button" variant="ghost" size="sm" disabled={pendente} onClick={onCancelar}>
        Cancelar
      </Button>
      <Button type="button" size="sm" disabled={pendente || !podeConfirmar} onClick={onConfirmar}>
        {rotulo}
      </Button>
    </div>
  );
}

export function RendaCicloAcoes({
  cicloId,
  moeda,
  rendaConfirmada,
}: {
  cicloId: string;
  moeda: MoedaRenda;
  rendaConfirmada: boolean;
}) {
  const router = useRouter();
  const podeEscrever = usePodeEscrever();
  const [aberto, setAberto] = useState<'recalcular' | 'confirmar' | null>(null);
  const [previa, setPrevia] = useState<ImpactoRenda | PreviaConfirmacaoRenda | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const [bruta, setBruta] = useState('');
  const [taxa, setTaxa] = useState('');
  const [imposto, setImposto] = useState(0);
  const [liquida, setLiquida] = useState(0);
  const [gerar, setGerar] = useState(true);

  if (!podeEscrever) return null;

  const fechar = () => {
    setAberto(null);
    setPrevia(null);
    setErro(null);
  };

  function entrada(): RendaRealEntrada {
    return moeda === 'USD'
      ? { brutaOrigemCents: parseBRL(bruta), taxa, impostoCents: imposto, gerarLancamento: gerar }
      : { liquidaCents: liquida, gerarLancamento: gerar };
  }

  function rodar<T>(chamada: () => Promise<{ ok: true; data: T } | { ok: false; erro: string }>, aoOk: (d: T) => void) {
    setErro(null);
    iniciar(async () => {
      try {
        const r = await chamada();
        if (r.ok) aoOk(r.data);
        else setErro(r.erro);
      } catch {
        // parseBRL de campo vazio/inválido
        setErro('Confira os valores digitados.');
      }
    });
  }

  const abrirRecalculo = () => {
    setAberto('recalcular');
    rodar(previaRecalculoRendaAction, setPrevia);
  };
  const aoGravar = () => {
    fechar();
    router.refresh();
  };
  const invalidar = () => setPrevia(null);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {!rendaConfirmada ? (
          <Button type="button" variant="ghost" size="sm" onClick={abrirRecalculo}>
            Recalcular renda deste ciclo
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="sm" onClick={() => setAberto('confirmar')}>
          {rendaConfirmada ? 'Corrigir renda real' : 'Confirmar renda real'}
        </Button>
      </div>

      <Modal open={aberto === 'recalcular'} onClose={fechar} ariaLabel="Recalcular renda deste ciclo">
        <h2 className="mb-3 text-lg font-semibold text-fg">Recalcular renda deste ciclo</h2>
        {previa ? <Previa p={previa} /> : <p className="text-sm text-muted">Calculando…</p>}
        {erro ? <p className="mt-2 text-sm text-negativo">{erro}</p> : null}
        <Rodape
          onCancelar={fechar}
          pendente={pendente}
          podeConfirmar={previa != null}
          rotulo="Confirmar"
          onConfirmar={() => rodar(recalcularRendaAction, aoGravar)}
        />
      </Modal>

      <Modal open={aberto === 'confirmar'} onClose={fechar} ariaLabel="Confirmar renda real">
        <h2 className="mb-3 text-lg font-semibold text-fg">Confirmar renda real</h2>
        <div className="space-y-3" onChange={invalidar}>
          {moeda === 'USD' ? (
            <>
              <div>
                <Label htmlFor="rr-bruta">Bruto recebido (US$)</Label>
                <Input id="rr-bruta" inputMode="decimal" value={bruta} onChange={(e) => setBruta(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="rr-taxa">Cotação usada (R$ por US$)</Label>
                <Input
                  id="rr-taxa"
                  inputMode="decimal"
                  placeholder="5,43"
                  value={taxa}
                  onChange={(e) => setTaxa(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="rr-imposto">Imposto pago (R$)</Label>
                <MoneyInput id="rr-imposto" valueCents={imposto} onChangeCents={setImposto} />
              </div>
            </>
          ) : (
            <div>
              <Label htmlFor="rr-liquida">Renda líquida recebida (R$)</Label>
              <MoneyInput id="rr-liquida" valueCents={liquida} onChangeCents={setLiquida} />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-fg">
            <Checkbox checked={gerar} onChange={(e) => setGerar(e.target.checked)} />
            Gerar lançamento de renda
          </label>
        </div>
        <div className="mt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pendente}
            onClick={() => rodar(() => previaRendaRealAction(cicloId, entrada()), setPrevia)}
          >
            Ver prévia
          </Button>
        </div>
        {previa ? (
          <div className="mt-3 border-t border-border pt-3">
            <Previa p={previa} />
          </div>
        ) : null}
        {erro ? <p className="mt-2 text-sm text-negativo">{erro}</p> : null}
        <Rodape
          onCancelar={fechar}
          pendente={pendente}
          podeConfirmar={previa != null}
          rotulo="Confirmar"
          onConfirmar={() => rodar(() => confirmarRendaRealAction(cicloId, entrada()), aoGravar)}
        />
      </Modal>
    </>
  );
}
