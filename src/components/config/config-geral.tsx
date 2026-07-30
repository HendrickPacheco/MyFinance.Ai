'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select } from '@/components/ui';
import { formatBRL, parseBRL } from '@/shared/dinheiro';
import { atualizarConfig } from '@/actions/config';
import type { Config, Conta } from '@/domain/model/entidades';

export function ConfigGeral({ config, contas }: { config: Config; contas: Conta[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [renda, setRenda] = useState(formatBRL(config.rendaBaseCents));
  const [rendaVariavel, setRendaVariavel] = useState(config.rendaVariavel);
  const [dia, setDia] = useState(String(config.diaRecebimento));
  const [usarPercent, setUsarPercent] = useState(config.metaPoupancaPercent != null);
  const [metaValor, setMetaValor] = useState(formatBRL(config.metaPoupancaCents));
  const [metaPercent, setMetaPercent] = useState(String(config.metaPoupancaPercent ?? 20));
  const [destino, setDestino] = useState(config.destinoSobra);
  const [destinoContaId, setDestinoContaId] = useState(config.destinoSobraContaId ?? '');
  const [timezone, setTimezone] = useState(config.timezone);

  const bucketsDestino = contas.filter((c) => c.tipo === 'RESERVA' || c.tipo === 'INVESTIMENTO');

  const salvar = () => {
    setErro(null);
    setMsg(null);
    startTransition(async () => {
      try {
        const input = {
          rendaBaseCents: parseBRL(renda),
          rendaVariavel,
          diaRecebimento: Number(dia),
          metaPoupancaCents: usarPercent ? 0 : parseBRL(metaValor),
          metaPoupancaPercent: usarPercent ? Number(metaPercent) : null,
          moeda: 'BRL',
          timezone,
          destinoSobra: destino,
          destinoSobraContaId: destino === 'ROLLOVER' ? null : destinoContaId || null,
        };
        const r = await atualizarConfig(input);
        if (r.ok) {
          setMsg('Configuração salva. Vale a partir do próximo ciclo.');
          router.refresh();
        } else {
          setErro(r.erro);
        }
      } catch {
        setErro('Confira os valores digitados.');
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Renda, ciclo e meta</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <Label htmlFor="renda">Quanto cai na sua conta por mês (líquido)</Label>
          <Input
            id="renda"
            inputMode="decimal"
            value={renda}
            onChange={(e) => setRenda(e.target.value)}
            onFocus={(e) => e.target.select()}
          />
        </div>

        <label className="flex items-center gap-3 text-sm text-muted">
          <input
            type="checkbox"
            checked={rendaVariavel}
            onChange={(e) => setRendaVariavel(e.target.checked)}
            className="h-5 w-5 accent-[var(--color-accent)]"
          />
          Minha renda varia mês a mês
        </label>

        <div>
          <Label htmlFor="dia">Dia em que recebo (corte do ciclo)</Label>
          <Select id="dia" value={dia} onChange={(e) => setDia(e.target.value)}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                dia {d}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label>Meta de poupança (tratada como conta a pagar)</Label>
          <div className="mb-2 flex gap-2">
            <button
              type="button"
              onClick={() => setUsarPercent(false)}
              className={tabCls(!usarPercent)}
            >
              Valor fixo
            </button>
            <button
              type="button"
              onClick={() => setUsarPercent(true)}
              className={tabCls(usarPercent)}
            >
              % da renda
            </button>
          </div>
          {usarPercent ? (
            <div className="flex items-center gap-2">
              <Input
                inputMode="decimal"
                value={metaPercent}
                onChange={(e) => setMetaPercent(e.target.value)}
                className="w-28"
              />
              <span className="text-muted">% da renda do mês</span>
            </div>
          ) : (
            <Input
              inputMode="decimal"
              value={metaValor}
              onChange={(e) => setMetaValor(e.target.value)}
              onFocus={(e) => e.target.select()}
            />
          )}
        </div>

        <div>
          <Label htmlFor="destino">Para onde vai a sobra no fechamento</Label>
          <Select
            id="destino"
            value={destino}
            onChange={(e) => setDestino(e.target.value as Config['destinoSobra'])}
          >
            <option value="RESERVA">Reserva</option>
            <option value="INVESTIMENTO">Investimento</option>
            <option value="ROLLOVER">Somar na verba do próximo ciclo</option>
          </Select>
          {destino !== 'ROLLOVER' ? (
            <div className="mt-2">
              <Label htmlFor="destinoConta">Bucket que recebe a sobra</Label>
              <Select
                id="destinoConta"
                value={destinoContaId}
                onChange={(e) => setDestinoContaId(e.target.value)}
              >
                <option value="">— escolher —</option>
                {bucketsDestino.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
        </div>

        <div>
          <Label htmlFor="tz">Fuso horário</Label>
          <Input id="tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        </div>

        {erro ? <p className="text-sm text-negativo">{erro}</p> : null}
        {msg ? <p className="text-sm text-positivo">{msg}</p> : null}

        <Button onClick={salvar} disabled={pending} size="lg" className="w-full">
          {pending ? 'Salvando…' : 'Salvar configuração'}
        </Button>
      </CardContent>
    </Card>
  );
}

function tabCls(ativo: boolean): string {
  return `min-h-[40px] rounded-lg px-3 text-sm ${
    ativo ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted'
  }`;
}
