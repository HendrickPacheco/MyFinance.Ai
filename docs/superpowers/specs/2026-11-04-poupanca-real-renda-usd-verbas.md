# Spec — Poupança real, renda em USD e verbas separadas (04/11/2026)

Branch `feat/poupanca-real-renda-usd-verbas` (worktree `../financial-poupanca`), a partir de `main`.
Autoridade: este arquivo + `CLAUDE.md` + `SPEC.md`. Onde o pedido original conflita com
decisões do `CLAUDE.md`, valem as **Decisões** abaixo (tomadas com o dono em 04/11/2026).

## Motivação (dados reais do dono)

Meta R$ 18.000/mês, app mostra "100% cumprida", mas o patrimônio subiu ~R$ 4.250/mês.
Renda real ~R$ 35.000 (US$ 7.300 via Deel), Config ainda em R$ 30.000. Verba do dia a dia e
de extras viram um número só.

## Decisões (sobrepõem o pedido original)

- **D1 — Split sem regredir D-16/D-11.** `verbaVariavelCents` e seu cálculo NÃO mudam
  (`renda − fixos − provisão (+ rollover)`). A meta NÃO é deduzida da verba e parcela NÃO
  é deduzida. O split é derivado, função pura em `src/domain/finance/`:
  - `gastavelCents = verbaVariavel − poupancaAlvo` (o máximo que dá para gastar e bater a meta)
  - `diaADiaCents = min(piso × diasDoCiclo, max(gastavel, 0))`
  - `extrasCents = gastavel − diaADia` (pode ser negativo → "faltam R$ N para cobrir o dia a dia")
  - Consumo: transações cujo tipoVerba efetivo é EXTRA (inclui toda parcela) consomem
    extras; o que excede extras passa a reduzir o dia a dia. Transações DIA_A_DIA
    consomem dia a dia. "Posso gastar hoje" do card dia a dia = restante dia a dia ÷ dias
    restantes (reaproveitar o motor de teto existente onde possível).
  - Nenhuma tela chama a meta de "reservada" nem a lista com "−" ao lado de fixos/provisão.
- **D2 — Piso** = `Config.pisoDiarioVerbaCents` existente (hoje 15000 = R$ 150). Sem campo novo.
- **D3 — Meta continua OBJETIVO** (D-16). O pedido diz "reservada como hoje" — premissa falsa;
  ignorar. Progresso passa a ser real/meta.
- **D4 — Cotação** é tabela GLOBAL (dado público PTAX), sem `donoId`. Taxa guardada como
  `Int taxaMicros` (taxa × 1.000.000, 6 casas exatas) em vez de `Decimal` — evita float/Decimal.js
  no domínio. Unique (data, moedaOrigem, moedaDestino).
- **D5 — Tolerância de snapshot**: constante de domínio 5 dias (`ponytail:` comentário; vira
  campo de Config se o dono pedir).
- **D6 — API do agente fora de escopo** (outra sessão cuida). Parte 4 = só ferramentas do
  copiloto em `src/application/ia/ferramentas/*`.
- **D7 — "Bug" de nov/26**: a Config no banco É R$ 30.000; o ciclo congelou corretamente.
  Não há bug de congelamento. Entregar a ação "Recalcular renda deste ciclo" (preview do
  impacto antes de salvar) e a confirmação de renda real.
- **D8 — Renda real confirmada** é ação explícita do dono (regra 3 da verba congelada): ao
  confirmar, recalcula a verba congelada do ciclo com a renda real; o ciclo guarda prevista
  e real.
- **D9** — Sem script `lint` no repo: gates são `pnpm test`, `pnpm typecheck`, `pnpm build`
  (build só com dev server parado — ver CLAUDE.md). Migrações à mão (CLAUDE.md "Migrações").
- **D10** — Testes nunca chamam o BCB de verdade: serviço de câmbio recebe `fetch` injetado.

## 1. Poupança real vs meta
- `Ciclo`: `poupancaRealCents Int?`, `patrimonioInicialCents Int?`, `patrimonioFinalCents Int?`,
  `fonteMedicaoPoupanca String?` (SNAPSHOT | SALDO_CONTAS | MANUAL).
- Fechamento: real = final − inicial, snapshot mais próximo do início e do fim (±5 dias).
  Sem snapshot no fim: fechamento pede registrar snapshot ou informar manualmente antes de fechar.
- Exibir onde aparece meta/progresso (dashboard, /ciclo, /fechar-ciclo, /historico, card
  "Poupança do mês"): Meta R$ X | Guardado de verdade R$ Y | Diferença R$ Z (cor) | % real.
  Remover "Progresso 100%" baseado só na meta; durante o ciclo mostrar "estimado" (saldo das
  contas), no fechamento o real.
- /historico: colunas "Poupança real", "Diferença vs meta"; média real 3/6/12 ciclos.
- /config: sugestão "Sua poupança real média dos últimos 3 ciclos foi R$ Y. Quer ajustar a
  meta?" — só sugere.
- Alerta no fechamento: se (renda − gasto total lançado − poupança real) > max(R$ 1.000, 5% da
  renda) → "R$ N sem explicação — provavelmente há gastos não lançados" com atalho para lançar.
  Alertar também se gasto variável do ciclo < 30% da média dos ciclos anteriores.
- Backfill: script que calcula `poupancaRealCents` dos ciclos fechados a partir dos snapshots.

## 2. Renda em USD com câmbio e imposto
- `Config`: `moedaRenda` (BRL|USD, default BRL), `rendaBrutaMoedaOrigemCents Int?`,
  `impostoEstimadoCents Int?` OU `impostoEstimadoPercentual` (um dos dois), `fonteRenda String?`.
- Tabela `Cotacao` (ver D4), fonte PTAX_BCB | MANUAL.
- Serviço em `infrastructure`: PTAX venda via
  `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='MM-DD-YYYY'&$format=json`,
  cache em `Cotacao`, fallback para dia útil anterior, timeout, nunca quebra a página: usa
  última cotação salva e avisa.
- Renda prevista BRL = bruta × cotação − imposto, com decomposição em texto:
  "US$ 7.300 × R$ 5,43 = R$ 39.639 − imposto R$ 3.500 = R$ 36.139".
- `Ciclo`: `rendaRealBrutaMoedaOrigemCents Int?`, `cotacaoRealUsadaMicros Int?`,
  `impostoRealCents Int?`, `rendaRealLiquidaCents Int?`. Confirmada, substitui a prevista em
  verba/projeção/fechamento; histórico guarda as duas.
- Gerar lançamento RENDA vinculado ao ciclo a partir da confirmação (preview antes de salvar).
- /projecao: renda USD × última cotação − imposto estimado; slider de cotação R$ 4,80–6,50.
- Card no dashboard: "Renda do ciclo: US$ 7.300 · cotação R$ X (data) · líquido R$ Y".
- /ciclo: ação "Recalcular renda deste ciclo" com preview (D7).

## 3. Verbas separadas
- Fórmula: D1.
- `Categoria.tipoVerba` (DIA_A_DIA | EXTRA). Padrões: Mercado, Delivery, Restaurante,
  Transporte, Combustível, Farmácia = DIA_A_DIA; Vestuário, Lazer, Eletrônicos, Presentes,
  Casa, Desenvolvimento, Outros = EXTRA (categoria desconhecida → EXTRA). Editável em /config.
  `Transacao.tipoVerbaOverride` nullable.
- Dashboard: dois cards — Dia a dia ("Posso gastar hoje R$ X", gasto hoje, ritmo) e Extras
  (disponível no mês, usado, restante).
- Parcela/compra grande consome extras primeiro; quando extras zera reduz dia a dia, com alerta
  "Essa compra vai reduzir seu dia a dia para R$ X/dia".
- Simulador de compra parcelada (`simular_compra_parcelada` + tela) mostra impacto nas duas
  verbas mês a mês.
- /projecao: colunas separadas dia a dia e extras.
- Aviso "A meta atual gera uma verba de R$ X por dia, abaixo do piso" passa a dizer o que falta
  e de onde (meta alta, parcela, renda menor).

## 4. Copiloto
- Ferramentas do copiloto expõem poupança real vs meta, renda USD/cotação/imposto/líquido,
  verba dia a dia e extras. Seguir D-14 (null com motivo) e D-15 (número com suas partes).

## 5. Testes (vitest, domain)
Poupança real (com e sem snapshot), alerta de lançamentos faltando, USD→BRL com imposto fixo e
percentual, fallback de cotação, split das verbas (incl. extras negativa), consumo de extras
antes do dia a dia, recálculo de renda do ciclo. Gates: test, typecheck, build.

## Entrega
Resumo, migrations, telas afetadas (prints se possível), como fica nov/26 com US$ 7.300 e
imposto R$ 3.500, link do PR. Sem deploy.
