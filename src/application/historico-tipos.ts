/**
 * Contrato do read-model do Histórico (`/historico`): um retrato por ciclo
 * FECHADO, do mais novo para o mais antigo, com os gráficos de evolução e a
 * tabela mês a mês que dão o drill-down para `/historico/[cicloId]`.
 *
 * A forma mora no motor (`domain/finance/historico.ts`), que é quem a produz;
 * aqui ela só é reexportada com o nome que a camada de apresentação usa. Este
 * arquivo já declarou as mesmas interfaces por conta própria, e a cópia
 * obrigava um `as EstadoHistorico` na saída do read-model: um cast que
 * continuaria compilando no dia em que um campo novo entrasse só de um lado.
 *
 * Existe (em vez de a UI importar de `@/domain/finance` direto) porque o
 * componente de tela não deve depender do motor: se um dia a apresentação
 * precisar de um campo que o domínio não tem, ele nasce aqui, num tipo que
 * estende o do motor — sem contaminar o cálculo com necessidade de layout.
 *
 * Regras que valem aqui como em todo lugar: dinheiro é `Int` em centavos e
 * todo campo monetário termina em `Cents`; data civil é string "YYYY-MM-DD".
 * Nada aqui é recalculado a partir da Config de hoje: todo valor congelado do
 * ciclo (fixos, provisão, poupança-alvo, verba, rollover) é lido COMO ESTÁ
 * GRAVADO (regra 3) — o dono precisa ver o mês que ele teve, não o que teria
 * se tivesse nascido hoje.
 */
export type { MesHistorico, TotaisHistorico, EstadoHistorico } from '@/domain/finance';
