'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Segmented,
  Select,
} from '@/components/ui';
import { formatBRL, parseBRL } from '@/shared/dinheiro';
import { atualizarConfig } from '@/actions/config';
import type { Config, Conta } from '@/domain/model/entidades';
import type { VerificacaoMetaIrreal } from '@/domain/finance';

export function ConfigGeral({
  config,
  contas,
  avisoMetaIrreal,
  sugestaoRendaVariavelCents,
  sugestaoMetaPoupancaCents,
}: {
  config: Config;
  contas: Conta[];
  avisoMetaIrreal: VerificacaoMetaIrreal;
  sugestaoRendaVariavelCents: number | null;
  sugestaoMetaPoupancaCents: number | null;
}) {
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
  const [pisoDiario, setPisoDiario] = useState(formatBRL(config.pisoDiarioVerbaCents));

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
          pisoDiarioVerbaCents: parseBRL(pisoDiario),
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

        {rendaVariavel ? (
          <div className="rounded-xl border border-border-strong bg-surface-2 p-3 text-sm">
            {sugestaoRendaVariavelCents != null ? (
              <>
                <p className="text-muted">
                  Nos últimos ciclos fechados, a <strong>menor</strong> renda recebida foi{' '}
                  <span className="tnum font-medium text-fg">
                    {formatBRL(sugestaoRendaVariavelCents)}
                  </span>
                  . Planejar pelo mês bom é o que costuma faltar dinheiro no mês ruim — considere
                  usar esse valor como renda prevista.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => setRenda(formatBRL(sugestaoRendaVariavelCents))}
                >
                  Usar {formatBRL(sugestaoRendaVariavelCents)}
                </Button>
              </>
            ) : (
              <p className="text-muted">
                Ainda não há ciclos fechados suficientes (mínimo 2) para sugerir uma renda prevista.
                A sugestão aparece aqui assim que houver histórico.
              </p>
            )}
          </div>
        ) : null}

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
          <Segmented
            className="mb-2"
            ariaLabel="Forma da meta de poupança"
            valor={usarPercent ? 'percent' : 'fixo'}
            onChange={(v) => setUsarPercent(v === 'percent')}
            opcoes={[
              { value: 'fixo', label: 'Valor fixo' },
              { value: 'percent', label: '% da renda' },
            ]}
          />
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
          <Label htmlFor="piso">Piso diário mínimo da verba variável</Label>
          <Input
            id="piso"
            inputMode="decimal"
            value={pisoDiario}
            onChange={(e) => setPisoDiario(e.target.value)}
            onFocus={(e) => e.target.select()}
          />
          <p className="mt-1 text-xs text-faint">
            Se a verba do dia ficar abaixo disso, avisamos aqui que a meta está ambiciosa demais.
          </p>
        </div>

        {avisoMetaIrreal.irreal ? (
          <div className="rounded-[var(--radius-card)] border border-atencao/40 bg-atencao/5 p-4 text-sm">
            <div className="flex items-center gap-2 text-atencao">
              <AlertTriangle size={16} />
              <p className="font-medium">Meta de poupança ambiciosa demais</p>
            </div>
            <p className="mt-2 text-muted">
              Com os parâmetros atuais, a verba do próximo ciclo fica em{' '}
              <span className="tnum font-medium text-fg">
                {formatBRL(avisoMetaIrreal.verbaDiariaCents)}
              </span>{' '}
              por dia — abaixo do piso de{' '}
              <span className="tnum font-medium text-fg">
                {formatBRL(avisoMetaIrreal.pisoDiarioCents)}
              </span>
              . Isso gera um teto irreal, que tende a furar e frustrar até o app ser abandonado.
            </p>
            {sugestaoMetaPoupancaCents != null ? (
              <>
                <p className="mt-2 text-muted">
                  Nos últimos 2 ciclos fechados você bateu a meta de poupança com folga usando{' '}
                  <span className="tnum font-medium text-fg">
                    {formatBRL(sugestaoMetaPoupancaCents)}
                  </span>
                  .
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => {
                    setUsarPercent(false);
                    setMetaValor(formatBRL(sugestaoMetaPoupancaCents));
                  }}
                >
                  Usar {formatBRL(sugestaoMetaPoupancaCents)}
                </Button>
              </>
            ) : (
              <p className="mt-2 text-muted">
                Ainda não há 2 ciclos fechados com folga suficiente para sugerir um valor
                alternativo.
              </p>
            )}
          </div>
        ) : null}

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
