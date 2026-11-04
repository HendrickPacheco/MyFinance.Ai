# Plano — Home no visual do protótipo + tema claro/escuro

Spec: pedido do dono (04/11/2026) + protótipo `docs/design/dashboard/index.html` (fonte
da verdade visual) + `CLAUDE.md` (regras invioláveis). Branch `feat/home-dashboard-prototipo`.

## Global Constraints

- **Só UI + read-model.** Não mudar regra de negócio do motor existente, cálculos existentes
  nem `prisma/schema.prisma`. Função pura NOVA em `src/domain/finance/` é permitida (CLAUDE.md
  regra 4: cálculo nunca em componente/action) e exige teste Vitest.
- Dinheiro é `Int` em centavos, campo termina em `Cents`; formatação só via `src/shared/dinheiro.ts`
  (`formatBRL` etc.) e só na renderização. Data civil `"YYYY-MM-DD"`, aritmética via `src/shared/data.ts`,
  nunca `new Date("YYYY-MM-DD")`.
- D-11: parcela é `Transacao` VARIAVEL e consome verba. D-16: meta é objetivo, não dedução —
  nenhuma tela chama a meta de "reservada".
- Componentes da home: um por card em `src/components/dashboard/` (alias `@/components/dashboard/...`).
  Componente não faz aritmética monetária: recebe números prontos do read-model.
- Tokens: nada de hex solto nos componentes — usar classes Tailwind geradas pelos tokens do `@theme`
  em `app/globals.css` (ex.: `bg-surface`, `text-muted`, `border-border`, `bg-accent-soft`).
- Fidelidade ao protótipo: copiar tamanhos/pesos/espaçamentos/raios/sombras do CSS do protótipo
  (valores arbitrários do Tailwind são OK quando não houver token, ex.: `text-[76px]`, `tracking-[-.04em]`).
- Breakpoint mobile do protótipo: `max-width:760px`. Usar `max-[760px]:` / `min-[761px]:`.
- Gates por tarefa: `pnpm test` verde, `pnpm typecheck` limpo. Não rodar `next build` nem apagar
  `.next` se houver dev server (`lsof -ti:3000`).
- Commits em inglês ou português no estilo do repo (`feat(home): ...`), terminando com
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Design tokens (valores exatos)

Claro (padrão do app inteiro):

| token (`--color-*`) | valor |
|---|---|
| bg | #F7F8FA |
| surface | #FFFFFF |
| surface-2 (bloco interno) | #FAFAFC |
| border (cards) | #ECEDF1 |
| border-strong | #DCDEE6 |
| line (linhas) | #F2F3F6 |
| line-2 | #EFF0F4 |
| track (trilho das barras / borda do bloco) | #F0F1F5 |
| fg | #0F1222 |
| fg-2 (texto de linha) | #2A2E40 |
| muted | #6B7083 |
| faint | #8A8FA3 |
| subtle | #A3A7B7 |
| accent | #6D28D9 |
| accent-hover | #5B21B6 |
| accent-from (gradiente logo) | #7C3AED |
| accent-light | #C4B5FD |
| accent-soft (ícones) | #F5F0FF |
| accent-chip | #F3EEFF |
| accent-avatar | #EDE7FB |
| accent-pill-border | #E4D9FB |
| accent-fg | #FFFFFF |
| positivo | #16A34A |
| positivo-soft | #DCFCE7 |
| positivo-dot | #22C55E |
| atencao | #D97706 |
| negativo | #DC2626 |
| recuperacao | #EA580C |

Escuro (`html[data-theme='dark']`), derivado da mesma paleta:

| token | valor |
|---|---|
| bg #0B0C12 · surface #14151F · surface-2 #191A26 · border #24263A · border-strong #33364D |
| line #1E2030 · line-2 #202233 · track #262840 |
| fg #F3F4F8 · fg-2 #D6D8E3 · muted #9A9FB5 · faint #7C8199 · subtle #5F6480 |
| accent #8B5CF6 · accent-hover #A78BFA · accent-from #8B5CF6 · accent-light #6D4FC2 |
| accent-soft #1F1934 · accent-chip #241C3D · accent-avatar #2A2145 · accent-pill-border #3B2F63 · accent-fg #FFFFFF |
| positivo #4ADE80 · positivo-soft #12301F · positivo-dot #22C55E · atencao #F4B740 · negativo #FF6B6B · recuperacao #FF8F5E |

Sombra de card (token `--shadow-card`): claro `0 1px 2px rgba(16,24,40,.04), 0 8px 24px -12px rgba(16,24,40,.08)`;
escuro `0 1px 2px rgba(0,0,0,.3), 0 8px 24px -12px rgba(0,0,0,.5)`.
Botão primário: `bg-accent text-accent-fg rounded-[12px] px-[26px] py-[13px] font-semibold text-[15px]`,
sombra `0 6px 16px -6px var(--color-accent)`, hover `bg-accent-hover`.
Card: `bg-surface border border-border rounded-[20px] p-6 shadow-card`.
Bloco interno: `bg-surface-2 border border-track rounded-2xl p-5`.
Barras: altura 8px (fina 5px), `rounded-full`, trilho `bg-track`.

### Regras de exibição "dia a dia / extras" (decididas com o dono)

Entradas do ciclo atual: `verbaVariavelCents`, `poupancaAlvoCents` (meta), `parcelasCicloCents`
(parcelas com competência no ciclo), `pisoDiarioVerbaCents` (Config), `diasTotais`, `diasRestantes`
(inclui hoje), `gastoDiaADiaCents` = gasto variável realizado SEM parcelas (`gastoVariavelSemParcelasCents`).

- `gastavelCents = max(0, verba − meta − parcelasCiclo)` (ver Ruling R1 no ledger)
- `diaADiaCents = min(piso × diasTotais, gastavel)`
- `extrasCents = gastavel − diaADia`
- `usadoDiaADiaCents = min(gasto, diaADia)`; `usadoExtrasCents = max(0, gasto − diaADia)` (limitado a extras)
- `extrasDisponivelCents = max(0, extras − usadoExtras)`
- `possoGastarHojeCents = floor(max(0, diaADia − gasto) / max(1, diasRestantes))`
- `ritmoOk = gasto ≤ floor(diaADia × (diasTotais − diasRestantes + 1) / diasTotais)`
  (rótulo: `dia a dia · ritmo ok` / `dia a dia · acima do ritmo`)

## Tasks

### Task 1: Função pura `divisaoDiaADia` (domínio)

Files: `src/domain/finance/dia-a-dia.ts`, `src/domain/finance/dia-a-dia.test.ts`, export em `src/domain/finance/index.ts`.

Implementar exatamente as fórmulas da seção "Regras de exibição" como uma função
`divisaoDiaADia(entrada) → { gastavelCents, diaADiaCents, extrasCents, usadoDiaADiaCents,
extrasDisponivelCents, possoGastarHojeCents, ritmoOk }`. Tudo Int, divisão com `Math.floor`.
Testes: caso protótipo (piso 8_333, 30 dias, gastável 537_900 → diaADia 249_990, extras 287_910,
gasto 0, 26 restantes); gastável < piso×dias (extras 0); gasto acima do dia a dia consome extras;
meta + parcelas > verba (tudo 0, sem negativos); diasRestantes 0 não divide por zero; ritmo ok/acima.

### Task 2: Parser do lançamento rápido em texto

Files: `src/domain/lancamento/interpretar.ts`, `src/domain/lancamento/interpretar.test.ts`.

`interpretarLancamentoRapido(texto, categorias: {id,nome}[]) → { ok: true, valorCents, descricao,
metodo: MetodoPagamento | null, categoriaId: string | null } | { ok: false, erro }`.
- Valor: primeiro token numérico — aceita `80`, `80,50`, `80.50`, `1.234,56`, `R$ 80`. Centavos Int
  (usar `parseBRL` de `src/shared/dinheiro.ts` se servir). Sem valor ou ≤ 0 → erro "Informe um valor.".
- Método: palavra-chave sem acento/caixa — `credito|cartao`→ crédito, `debito`→ débito, `pix`,
  `dinheiro|especie`; mapear para os valores reais de `METODO_PAGAMENTO` (`src/domain/model/enums.ts`).
  Token removido da descrição.
- Categoria: algum token restante casa (sem acento/caixa, prefixo ≥3 letras) com nome de categoria → id;
  senão `null` (o chamador usa a mais usada).
- Descrição: tokens restantes juntos (ex.: "mercado"); vazia → `null`.
Testes cobrindo cada formato acima e os casos de erro.

### Task 3: Tema claro (app inteiro) + toggle escuro + Inter

Files: `app/globals.css`, `app/layout.tsx`, `src/shared/anti-flash-script.ts`, `middleware.ts` (só se o
hash/nonce exigir), novo `src/components/layout/tema-toggle.tsx`, `src/components/layout/sidebar.tsx`.

- Substituir os valores do `@theme` pelos tokens CLAROS da tabela (manter os nomes existentes
  `bg, surface, surface-2, border, border-strong, fg, muted, faint, accent, accent-fg, positivo,
  atencao, negativo, recuperacao` para que TODAS as telas mudem; adicionar os novos). Adicionar
  `--shadow-card`. Bloco `html[data-theme='dark'] { --color-…: … }` com os valores escuros.
  Atualizar o comentário de "direção de design" do arquivo.
- Inter via `next/font/google` (pesos 400–800), aplicada no `<html>`/`<body>` como `--font-sans`;
  `antialiased`.
- Anti-flash: estender o script inline existente (mesma constante, mesma autorização CSP) para também
  ler `localStorage['financial:tema']` (`'dark'|'light'`, padrão `light`) e setar `data-theme` no `<html>`.
- `TemaToggle` (client): botão ícone lucide Sun/Moon, alterna `data-theme` + grava localStorage
  (try/catch), `aria-label`. Colocar na sidebar (rodapé) — a home também usará no header (Task 5).
- `viewport.themeColor` → `#F7F8FA`.
- Varrer `app/` e `src/components/` por cores hardcoded do tema escuro antigo (ex.: `#0a0c11`,
  `bg-black`, `text-white` usados como superfície) e trocar por tokens, para nenhuma tela ficar
  ilegível no claro. Não redesenhar outras telas.

### Task 4: Read-model da home

Files: `src/application/home-tipos.ts`, `src/application/home.ts`, `src/application/home.test.ts`
(padrão de `dashboard.test.ts` com `__fakes__`), `src/domain/finance/proximos-vencimentos.ts` + teste.

`obterEstadoHome(deps): Promise<EstadoHome>` compõe `obterEstadoPainel(deps)` (não duplicar sua lógica),
`obterProjecao(deps, { numCiclos: 8 })`, Config (`pisoDiarioVerbaCents`) e o ator (iniciais).
Contrato `EstadoHome` (tudo pronto para exibir, sem aritmética no componente):
- `cabecalho`: `{ mesNome: 'Novembro', diaDoCiclo, diasTotais, iniciais }` (iniciais do nome/email do ator; fallback "?").
- `hero`: saída de `divisaoDiaADia` + `diasRestantes` + `usadoDiaADiaCents` + `diaADiaCents` + `progressoPercent` (0–100) + `emRecuperacao`.
- `extras`: `{ disponivelCents, totalCents, progressoPercent }`.
- `metaPoupanca`: `{ projetadaCents, alvoCents, progressoPercent }` de `estadoPainel.metas` (card "Meta de poupança"; subtítulo "sobra projetada no fechamento").
- `reserva`: `{ totalCents, meses: number|null, metaMeses: 6, progressoPercent, motivoSemDado: string|null }`
  — total = classe RESERVA de `patrimonio.porClasse` (0 se não houver), meses = `patrimonio.mesesDeReserva`.
- `despesas`: `{ totalCents, pagoCents, aPagarCents, fixoPercent, parceladoPercent,
  fixo: { totalCents, pagoCents, qtd, qtdPagas, pagoPercent, maiores: LinhaDespesa[4], restantes },
  parcelado: { ... mesmo formato ..., terminamEsteMes: { qtd, valorCents, mesSeguinte: 'dez' } | null } }`
  — fixos de `custosFixos`, parcelas de `parcelados`; `maiores` = 4 maiores por valor com `pago` e,
  p/ parcela, rótulo `3/5` ou `4/4 · última`. Usar `resumoPagamentosCents` existente.
- `proximos7Dias`: `{ itens: { tipo:'FIXO'|'PARCELA', id, nome, data, rotuloData:'07/11' | '08/11 · parcela 3/5', valorCents }[], total }`
  — função pura `proximosVencimentos({ hoje, dias:7, fixos(com data via dataVencimentoNoCiclo), parcelas })`:
  não pagos, `hoje ≤ data ≤ hoje+6`, ordenados por data/nome. `id` = `custoFixoId` ou `transacaoId`.
- `verbaLivre`: `{ pontos: { rotulo:'nov/26'|'dez', verbaLivreCents }[], ultimoCents, ultimoMes:'jun',
  faixaParcelasTerminando: { inicioIdx, fimIdx } | null }` — dos ciclos da projeção; faixa = primeiro..último
  índice com `terminamNesteCiclo.length > 0`. Primeiro rótulo `mmm/aa`, demais `mmm`.
Testes: hero/extras coerentes; próximos 7 dias filtra pago/fora da janela; despesas soma e percentuais.

### Task 5: Componentes do topo

Files (em `src/components/dashboard/`): `home-header.tsx`, `hero-hoje.tsx`, `lancamento-texto.tsx`,
`extras-card.tsx`, `meta-poupanca-card.tsx`, `reserva-card.tsx`, e `ui-home.tsx` (primitivas
compartilhadas: `Card`, `Barra`, `Valor` com "R$" menor) se reduzirem duplicação.

Reproduzir exatamente o HTML/CSS do protótipo (`.top`, `.hero`, `.qe`, `.g3`, `.ring`) com os tokens.
- Header: logo (quadrado 32px raio 10px gradiente `accent-from→accent-hover` 135deg, ícone trend),
  "MyFinance" 18px/800, data `"{mesNome} · dia {d} de {n}"`, `TemaToggle`, avatar 38px.
- Hero: valor `possoGastarHojeCents` grande (76px/800, "R$" 32px faint; mobile 64px), ponto de status
  verde (ou atenção se `!ritmoOk`), barra com `usado de diaADia usados no mês` e `N dias restantes`.
  Valor inteiro sem centavos quando redondo, como o protótipo (usar formatador existente).
- `LancamentoTexto` (client): ícone +, input placeholder "Ex.: 80 mercado crédito", botão "Lançar";
  usa `interpretarLancamentoRapido` + action `criarTransacao` existente (`src/actions/transacoes.ts`);
  sem categoria casada → primeira de `categoriasLancamento` VARIAVEL. Erro inline, toast com desfazer
  reaproveitando o padrão de `src/components/hoje/lancamento-rapido.tsx`. Mobile: sticky top 10px.
- Cards: Extras (valor + "disponível", sub "para compras pontuais", barra fina opacidade .35),
  Meta de poupança (anel SVG 72px r30 stroke 8, % no centro), Reserva (valor, "4,3 meses · meta 6 meses", barra fina).

### Task 6: Componentes de baixo

Files: `src/components/dashboard/despesas-mes-card.tsx`, `proximos-dias-card.tsx`, `verba-livre-card.tsx`.

- Despesas: cabeçalho com total + "total de despesas", sub "X pago · Y a pagar", barra segmentada
  (fixo accent / parcelado accent-light, gap 3px, 10px) + legenda; dois blocos (`dg`) com num 26px,
  sub, barra fina, linha "X pago de Y | %", linhas `.dl` (selo verde "pago" com check), link
  "+N outras →" (`/custos/fixos`, `/custos/parcelados`), chip `terminamEsteMes` "2 terminam este mês · −R$ 702 em dez".
- Próximos 7 dias: título h3 16px/700, "N contas", linhas com ícone 40px (lucide: FIXO `Receipt`,
  PARCELA `CreditCard`) em `bg-accent-soft`, nome, rótulo, valor, pill "Pagar" que chama
  `marcarCustoFixoPago`/`marcarParcelaPaga` de `src/actions/pagamentos.ts` (conferir assinaturas) + `router.refresh()`;
  link "Ver todas as contas →" para `/custos`. Estado vazio: "Nada vence nos próximos 7 dias."
- Verba livre: SVG próprio com a geometria do protótipo — viewBox 550×232, xs de 30 a 520 igualmente
  espaçados, linha de base y=200 (stroke border), y dos pontos mapeado linearmente max→44 e min→162,
  curva cúbica com controles no x médio, área com gradiente accent .22→0, pontos r4 branco/stroke accent 2.5,
  valor acima (`≥10.000` → "10,6k" exceto o último; demais inteiro "5.379"), rótulos de mês em y=222,
  faixa `accent-chip` rx10 de y=20 a 200 cobrindo `faixaParcelasTerminando` (±30 de x) com texto
  "parcelas terminando". Cores via `var(--color-…)` para seguir o tema. Cabeçalho "Verba livre nos
  próximos meses" / "projeção" e num "R$ 11.300 em jun". Link do card para `/projecao`.

### Task 7: Montar a home

Files: `app/page.tsx` (e remover componentes que ficarem órfãos — conferir com grep antes).

- Nova home única (desktop e mobile) na ordem do protótipo, `max-w-[1200px] mx-auto`, gaps 16px,
  grids `g3` (3 col → 1 col ≤760px) e `g2` (2 → 1). Manter: onboarding sem renda; aviso de
  `pendenciaFechamento` (estilizado com tokens) acima do hero; em `emRecuperacao` mostrar o
  `RecuperacaoCard` existente no lugar do hero.
- Remover `PainelDesktop` e a tela Hoje mobile antiga da home. Deletar só arquivos sem nenhum outro import.
- O header da home substitui o "chrome" de título; sidebar (desktop) e nav inferior (mobile) do layout continuam.

### Task 8: Conferência visual + prints

Files: `docs/design/dashboard/desktop.png`, `mobile.png` (prints do protótipo), `docs/design/dashboard/impl-desktop.png`,
`impl-mobile.png`; ajustes de estilo nos componentes.

Subir o dev server (se não houver), renderizar o protótipo e a home em 1440×(altura total) e 390×(altura total),
comparar seção a seção e corrigir divergências de espaçamento/tipografia/cor. Também tirar um print do tema escuro.
Listar divergências restantes com motivo no report.
