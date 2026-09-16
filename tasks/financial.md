# financial — Estado Atual

**Atualizado**: 2026-08-25

## Concluido recentemente
- **PR #7 mergeado na main** (`d57cd6e`): importação e conciliação de fatura, fases
  **I1 → I5** do `TASKS-IMPORTACAO.md`, em 8 commits. **1239 testes** verdes · `tsc`
  limpo · `verificar:isolamento` verde (62 transações reais intactas) · auditoria D7
  limpa · **`pnpm build` verde** (rodado com `NEXT_DIST_DIR=.next-verify`, dev server
  intacto).
- **I1** — migração à mão: `Importacao`/`ItemImportado`, `Transacao.origem` +
  `itemImportadoId @unique`, `Parcelamento.parcelaInicial`, anexo em `MensagemConversa`
  (`anexoNome` + FK, zero bytes), `BACKUP_VERSION` 4.
- **I2** — motor puro: `resolverAnoDaFatura` (virada de dezembro sem `new Date`),
  `conciliarFatura` (4 destinos, 3 níveis, afinidade por token, 1-para-1 gulosa),
  `chaveDeduplicacao`, `gerarParcelas` honrando `parcelaInicial`.
- **I3** — extração fatiada em blocos de 20 linhas, PDF local com `unpdf`, rota
  `POST /api/importacao` com as 3 guardas do backup, ferramentas
  `conciliar_importacao`/`propor_importacao`, anexo no chat e cartão por faixa.
- **I4** — `desfazerImportacao` reverte pelo caminho que criou; reversão parcial por
  desenho (linha em ciclo fechado fica gravada e é reportada com motivo).
- **I5** — README registra o que a D-16 aprovou. Achado: o fatiamento manda TODAS as
  linhas do documento, não só as de gasto (limite, dígitos do cartão, endereço sobem).
- **Grafo G0 e G8** (24/08): quatro arestas quebradas fechadas no schema
  (`CustoFixo.categoriaId`, `Parcelamento→Categoria`, `estornoDeId`, `cicloAnteriorId`)
  e tela "Para onde vai a renda".
- **Fluxo de trabalho**: as 3 fases foram implementadas por subagentes em ondas, com
  integração revisada por mim entre elas.

## Pendente
- 🔴 **Reiniciar o dev server**: o Prisma Client em memória é anterior à migração da I1.
  `pnpm db:generate && rm -rf .next && pnpm dev`.
- 🔴 **Nada da importação foi exercitado contra a API real nem no navegador.** Testes
  usam fakes; nenhuma fatura real passou pelo pipeline. Caminho mais barato de teste:
  colar o texto de uma fatura no chat com a competência do mês.
- Linha `AMBIGUA` não guarda os `candidatos` — a UI não mostra as opções lado a lado,
  que é o que a §7.4 do plano pede.
- Sem editor inline de ajustes (categoria/data/conta) no cartão de importação.
- `CUSTO_FIXO_RECONHECIDO` exibe a descrição da FATURA, não o nome do custo fixo.
- `retroativa` não é persistida em `ItemImportado`: rascunho reaberto rederiva a faixa
  sem a promoção por ciclo fechado.
- `UsoIA` sem `donoId` — teto diário de IA é GLOBAL entre donos (dívida antiga que a
  importação pressiona).
- **Grafo, fila restante**: G4 (divergências no `patrimonio_resumo`, ~1h) → G6 (aportes
  por origem) → G7 (`simular_meta_poupanca`) → G3 (série temporal). G1/G2 a reavaliar.
- A UI das conversas do copiloto nunca foi aberta no navegador (desde 22/08).

## Bugs conhecidos
**Nenhum aberto.**

## Decisoes
- **D-16** — o texto transcrito da fatura SAI da máquina (OpenAI). É perfil de consumo e
  deslocamento, não só número. Os bytes do documento nunca são persistidos; guarda-se o
  hash do texto normalizado e as linhas.
- **D-17 (c)** — `Parcelamento.parcelaInicial`. Compra de 12x importada a partir da 3ª
  grava 12 + inicial 3: registro honesto, projeção enxerga as 9 futuras, nada nasce em
  ciclo fechado. 🔴 Com `parcelaInicial > 1`, `valorTotalCents` é a soma das parcelas
  GERADAS, não da compra original.
- **D-18 revista (25/08)** — confirmação é LINHA A LINHA para o que grava; o que já casa
  com o registro existente é pulado sem pedir nada.
- 🔴 **R1** — custo fixo NUNCA vira `Transacao` (já descontado em `Ciclo.fixosCents`;
  lançar de novo conta R$ 4.884/mês duas vezes e derruba o teto). Tabela dos três
  caminhos de saída de dinheiro está no `CLAUDE.md`. Guarda é teste, não comentário.
- **O modelo só transcreve**: não devolve ano (função pura resolve a partir da
  competência) nem categoria. Campo decisório inferido nunca vira palpite gravado.
- **Vocabulário de domínio tem fonte única** (`model/enums.ts`) com trava de compilação.
  Duplicar união de string em dois arquivos é como uma delas envelhece sozinha — três
  ocorrências disso apareceram na I3, todas vindas de agentes paralelos.
- **`pnpm build` com dev server no ar**: usar `NEXT_DIST_DIR=.next-verify`. Mesmo
  `.next` deixa a app sem CSS.
- **`prisma migrate dev` é inutilizável aqui** (P3006): SQL à mão → `db execute` →
  `migrate resolve --applied`. `migrate diff` sempre quer dropar o índice HNSW.
- Anteriores seguem valendo: D-11, D-13, D-14, D-15, D-8 revisada, DA-3, memória nunca
  guarda dinheiro, multi-tenant escopado só em `composition.ts`, monolito hexagonal,
  proveniência nunca volta ao modelo, card de proposta reaberto é inerte (exceto o de
  importação, que é interativo porque cada linha tem estado próprio no banco).

## Stack
- Next.js 15 (App Router) · React 19 · TypeScript estrito (zero `any`)
- PostgreSQL 16 local (`financial_dev`) + Prisma 6 + pgvector 0.8.6
- Vitest (**1239 testes**) · Tailwind 4 · lucide-react · recharts · **unpdf**
- OpenAI SDK 7 (Responses API, `completarComTools` + `completarComSchema`) · zod +
  zod-to-json-schema
- Auth própria: Argon2id, sessão em cookie opaco, papéis OWNER/VIEWER
- Hexagonal: `shared/` → `domain/` → `application/` → `infrastructure/` → `app/`
- Scripts: `pnpm projetar [n]`, `pnpm verificar:isolamento`, `pnpm ia:verificar`
