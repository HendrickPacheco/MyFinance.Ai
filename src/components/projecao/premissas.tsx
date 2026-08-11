/**
 * As premissas da projeção, visíveis na tela (§3.4).
 *
 * Não é rodapé decorativo: projeção sem premissa declarada é promessa. Cada
 * número desta tela vale sob "renda constante, sobra zero, custos e provisões
 * de hoje, nenhum parcelamento novo" — e o dono precisa poder discordar de uma
 * premissa específica antes de tomar decisão a partir do gráfico.
 *
 * O texto vem inteiro de `ResumoProjecao.premissas`, montado na camada de
 * aplicação junto com a projeção. Reescrevê-lo aqui abriria a porta para a
 * tela declarar uma premissa que o motor não usa.
 */
export function Premissas({ premissas }: { premissas: readonly string[] }) {
  if (premissas.length === 0) return null;

  return (
    <section
      aria-labelledby="premissas-projecao"
      className="rounded-[var(--radius-card)] border border-border bg-surface px-5 py-4"
    >
      <h2
        id="premissas-projecao"
        className="text-xs uppercase tracking-widest text-muted"
      >
        Premissas
      </h2>
      <ul className="mt-2 space-y-1.5 text-sm text-muted">
        {premissas.map((premissa) => (
          <li key={premissa} className="flex gap-2">
            <span aria-hidden="true" className="text-faint">
              ·
            </span>
            <span>{premissa}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
