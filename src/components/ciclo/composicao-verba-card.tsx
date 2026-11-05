/**
 * Card "Composição da verba" (SPEC 7): renda prevista − fixos − provisão
 * (+ rollover se ≠0) = verba variável. A meta de poupança NÃO aparece aqui
 * (D-16): ela é objetivo, não dedução, e sai da verba só se o dono gastar
 * menos. Quem a listar como "−" volta a mostrá-la como gasto certo.
 * Puramente apresentacional —
 * sem interação, então fica Server Component.
 */
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui";
import { formatBRL } from "@/shared/dinheiro";
import { cn } from "@/lib/cn";
import type { Ciclo } from "@/domain/model/entidades";
import type { DivisaoVerba } from "@/domain/finance";
import { rendaEfetivaCents } from "@/domain/finance/renda";

interface LinhaComposicao {
  rotulo: string;
  valorCents: number;
  sinal: 1 | -1;
}

export function ComposicaoVerbaCard({
  ciclo,
  divisao,
  diaADiaDiarioCents,
}: {
  ciclo: Ciclo;
  /** Só a tela do ciclo atual mostra o split; o histórico omite. */
  divisao?: DivisaoVerba;
  diaADiaDiarioCents?: number;
}) {
  const linhas: LinhaComposicao[] = [
    {
      rotulo:
        ciclo.rendaRealLiquidaCents != null ? "Renda real" : "Renda prevista",
      valorCents: rendaEfetivaCents(ciclo),
      sinal: 1,
    },
    { rotulo: "Custos fixos", valorCents: ciclo.fixosCents, sinal: -1 },
    {
      rotulo: "Provisão mensal",
      valorCents: ciclo.provisaoMensalCents,
      sinal: -1,
    },
  ];

  if (ciclo.rolloverRecebidoCents !== 0) {
    const positivo = ciclo.rolloverRecebidoCents > 0;
    linhas.push({
      rotulo: positivo ? "Rollover recebido" : "Rollover devido",
      valorCents: Math.abs(ciclo.rolloverRecebidoCents),
      sinal: positivo ? 1 : -1,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Composição da verba</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {linhas.map((linha) => (
            <li
              key={linha.rotulo}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-muted">{linha.rotulo}</span>
              <span className="tnum text-fg">
                {linha.sinal === 1 ? "+" : "−"} {formatBRL(linha.valorCents)}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
          <span className="text-sm font-medium text-fg">Verba variável</span>
          <span className={cn("tnum text-2xl font-semibold text-accent")}>
            {formatBRL(ciclo.verbaVariavelCents)}
          </span>
        </div>

        {divisao ? (
          <ul className="mt-3 space-y-2">
            <li className="flex items-center justify-between text-sm">
              <span className="text-muted">Parcelas do ciclo</span>
              <span className="tnum text-fg">
                − {formatBRL(ciclo.verbaVariavelCents - divisao.verbaLivreCents)}
              </span>
            </li>
            <li className="flex items-center justify-between text-sm">
              <span className="text-muted">Verba livre</span>
              <span className="tnum text-fg">= {formatBRL(divisao.verbaLivreCents)}</span>
            </li>
          </ul>
        ) : null}

        {divisao && diaADiaDiarioCents != null ? (
          divisao.faltaParaPisoCents > 0 ? (
            <div className="mt-3 space-y-1 text-sm">
              <p className="text-muted">
                {divisao.gastavelCents <= 0
                  ? "Para bater a meta, não sobra nada para gastar neste ciclo."
                  : `Para bater a meta, gaste até ${formatBRL(divisao.gastavelCents)}, todo no dia a dia (${formatBRL(diaADiaDiarioCents)}/dia, sem extras).`}
              </p>
              <p className="text-negativo">
                Faltam {formatBRL(divisao.faltaParaPisoCents)} para cobrir o dia a dia.
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">
              Para bater a meta, gaste até {formatBRL(divisao.gastavelCents)} —{" "}
              {formatBRL(divisao.diaADiaCents)} no dia a dia ({formatBRL(diaADiaDiarioCents)}/dia) e{" "}
              {formatBRL(divisao.extrasCents)} em extras.
            </p>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}
