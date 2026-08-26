# CLAUDE.md — Controle Financeiro Pessoal

App pessoal (single-user, local) que responde uma pergunta por dia: **quanto posso
gastar hoje sem furar minha meta de poupança?** É um *limitador* de gastos, não um
registrador. A fonte de verdade do produto é o `SPEC.md` na raiz — leia-o inteiro
antes de mudanças estruturais.

## Estado atual

- **Fases 0 a 8 concluídas** — app funcional de ponta a ponta.
- Home responsiva (revisão de 03/08/2026): **painel de administração no desktop**
  (≥1024px, sidebar + KPIs + gráficos) e a tela Hoje original no mobile. Ver SPEC 7.1.
- Telas: home (`/`), Ciclo (`/ciclo`), Análise (`/analise`), Patrimônio (`/patrimonio`),
  Fechamento (`/fechar-ciclo`), Configuração (`/config`), Backup (`/config/backup`),
  Copiloto (`/copiloto`) e memória do copiloto (`/copiloto/memoria`).
- Banco: **PostgreSQL local** (`financial_dev`), migrado do SQLite em 03/08/2026.
- Em uso real, com dados do dono: renda R$ 30.000, meta R$ 18.000, 10 custos fixos
  (R$ 4.884), 13 parcelamentos (R$ 4.393,88/mês), ciclo = mês civil (`diaRecebimento` 1).
- Motor: suíte Vitest verde · `tsc --noEmit` limpo · `next build` verde.

### Regra de ouro do multi-tenant (04/08/2026)

**Todo dado financeiro pertence a um `donoId`.** O escopo é aplicado em UM lugar
só — `src/composition.ts`, que constrói cada repositório com o `donoId` do ator
da sessão. Consequências que não podem ser violadas:

- Em `src/infrastructure/repositories/prisma-repositories.ts`, **nunca**
  `findUnique({ where: { id } })` — use `findFirst({ where: { id, donoId } })`.
  `findUnique` não aceita filtro extra e devolveria a linha de outro usuário.
- Escrita por id usa `updateMany`/`deleteMany` com `{ id, donoId }`: com id
  alheio afeta zero linhas, em vez de alterá-las.
- Tabela financeira nova nasce com `donoId` + índice, e qualquer unicidade dela
  é **composta com `donoId`** (senão um usuário bloqueia o nome/data do outro).
- Confira com `pnpm verificar:isolamento` (cria dois donos reais, tenta vazar
  nos dois sentidos, limpa tudo e confere que seus dados não mudaram).
- **SQL cru não herda o escopo automático do Prisma Client.** A tabela `Memoria`
  usa SQL cru (pgvector não é tipado pelo Prisma), então lá o risco não é
  `findUnique` — é esquecer `AND "donoId" = $n` numa query montada à mão. Toda
  consulta de `prisma-memoria.ts` filtra por dono, e o script de isolamento
  cobre essa tabela justamente por isso.

### Armadilha recorrente desta sessão

Mudou `prisma/schema.prisma`, `.env` ou rodou migração? **O dev server precisa ser
reiniciado** — o Prisma Client fica em memória e continua servindo o schema antigo. Três
"bugs" já foram só isso (`pisoDiarioVerbaCents` undefined, 500 na home após a migração
para Postgres, `pagamentoFixo` undefined). Sintoma típico: `Cannot read properties of
undefined (reading 'findMany')` num repositório novo, ou campo novo chegando `undefined`.

`predev`/`prebuild` já rodam `prisma generate`, então subir o server sempre pega o client
fresco — mas **um server que já estava rodando quando o schema mudou continua velho**.
Recuperação: `pnpm db:generate && rm -rf .next && pnpm dev`.

### `next build` com o dev server de pé quebra o CSS

Irmã da armadilha do Prisma acima, e mais confusa porque parece regressão de estilo.
`next build` e `next dev` escrevem no **mesmo** `.next`. Rodar o build (ou `rm -rf .next`)
com um `pnpm dev` de pé deixa o server com um mapa de chunks apontando para arquivos que
não existem mais — a página carrega sem estilo nenhum e nada no código mudou.

Aconteceu em 24/08/2026 durante a G8. Sintoma: "o CSS todo quebrou" sem nenhum arquivo
`.css` no diff.

Recuperação: parar o dev server, `rm -rf .next`, `pnpm dev`, e refresh forçado no navegador.
**Antes de rodar `next build` ou apagar `.next`, verifique se há dev server rodando**
(`lsof -ti:3000`).

## Regras invioláveis (SPEC seção 13 — "Não faça")

1. **Dinheiro é sempre `Int` em centavos.** Nunca `Float`/`Decimal`/`Number` decimal
   para dinheiro em nenhum ponto. Todo campo/variável monetária termina em `Cents`.
   Formatação/parsing/rateio vivem só em `src/shared/dinheiro.ts`.
2. **Data civil é sempre `String` "YYYY-MM-DD".** Nunca `DateTime` para datas civis;
   `DateTime` só para `createdAt`/`updatedAt`. **Nunca** `new Date("2026-07-29")` para
   comparar dias (vira UTC e retrocede um dia no Brasil). Comparação = lexicográfica de
   string. Aritmética = `src/shared/data.ts` (date-fns via parseISO/format). "Hoje" vem
   de `hoje(timezone)` / porta `RelogioPort` — nunca `new Date()` espalhado.
3. **A verba do ciclo é CONGELADA.** Não recalcule a verba do ciclo atual a partir da
   Config a cada render. Editar parâmetros afeta o **próximo** ciclo. Existe ação
   explícita "recalcular ciclo atual" com aviso (SPEC 5.2).
4. **Toda regra de cálculo vive em `src/domain/finance/`** (funções puras, sem I/O).
   Nunca coloque cálculo em componente ou server action — eles só orquestram.
5. **Nunca misture custo fixo/provisão com verba variável** em cálculo ou exibição.
   Nenhuma tela mostra como disponível dinheiro já comprometido.
6. **`localStorage` não é fonte de verdade** (só preferências de UI).
7. ~~Sem autenticação, multiusuário ou integração bancária na v1.~~
   **REVOGADA em 04/08/2026** (parcialmente): o app agora tem **autenticação
   (sessão própria + Argon2id), papéis OWNER/VIEWER e é MULTI-TENANT** — cada
   usuário vê e escreve só as próprias finanças. Ver `TASKS-AUTH.md`. Segue
   valendo: **sem integração bancária**, e **sem tela de auto-cadastro**
   (usuário se cria por `pnpm db:seed-owner` ou direto no banco).
7b. **A IA nunca grava direto** (decisão D-8, revista em 04/08/2026). O copiloto
   PROPÕE, o dono CONFIRMA, e o caso de uso de sempre EXECUTA. Ferramenta de IA
   que chama `criarTransacao` é bug, não feature — ver `TASKS-IA.md` §12.
7c. **Memória do copiloto NUNCA guarda valor em dinheiro** (Fase E). O número de
   hoje é falso amanhã, e dentro de um embedding ninguém percebe que envelheceu.
   A guarda é `validarTextoMemoria` (`src/domain/memoria/regras.ts`), aplicada
   antes de qualquer gravação e de qualquer embedding. Memória é OWNER-only,
   inclusive na leitura (D-12).
8. **Nunca bloquear lançamento de gasto** por pendência de fechamento de ciclo.
9. Sem gráfico na tela Hoje. Sem dados fake/mock nas telas — estado vazio com ação.

## Decisões acordadas (deltas sobre a SPEC original)

- Divisão monetária usa **`floor`** com resto na última parte (inclusive `provisaoMensal`).
- `metaPoupancaPercent` (se preenchida) tem precedência e incide sobre a **renda do mês**
  (0–100, ex.: 20 = 20%).
- **Gasto de provisão** é marcado por FK `Transacao.provisaoId`: abate
  `ProvisaoAnual.acumuladoCents` e **não** consome verba (o motor exclui `provisaoId != null`).
- Fechar ciclo credita `provisaoMensalCents` no acumulado de cada provisão ativa.
- `destinoSobra = ROLLOVER` soma a sobra (positiva **ou** negativa) na verba do ciclo
  seguinte via `Ciclo.rolloverRecebidoCents`.
- Sobra move saldo para um bucket específico: `Config.destinoSobraContaId` (contas de
  RESERVA/INVESTIMENTO são editáveis pelo usuário: Reserva, CDB, Bitcoin, etc.).
- Renda realizada é **input** do usuário no fechamento, não somatório de transações.
- Parcelamento gera N transações com competência `dataCompra + k meses` (clamp de fim de
  mês); o `cicloId` é vinculado por data quando o ciclo nasce.
- **Sem piso diário hardcoded**: o teto é 100% derivado da verba, e a verba é
  `renda − poupança − fixos − provisão (+ rollover)` — ver `verbaVariavelCents`
  em `src/domain/finance/verba.ts`.
- **Razão e realidade são fontes distintas, conciliadas — nunca sincronizadas em
  silêncio** (decisão D-13, 11/08/2026). `Conta.saldoCents` é o *razão*: o que o app
  calculou a partir de transações e fechamentos. `ItemPatrimonio.valorCents` é a
  *realidade*: o que o dono observou no banco e digitou no snapshot. A diferença entre
  os dois **é informação** (gasto não lançado, rendimento, transferência que o app não
  viu) — sincronizar automaticamente destruiria esse sinal. `ItemPatrimonio.contaId`
  liga os dois; `divergenciasConciliacao` (`domain/finance/patrimonio.ts`) reporta; e
  só `aceitarRealidade` escreve, por ação explícita do dono. O ajuste move o saldo
  direto, **sem criar `Transacao`** — correção de registro não é gasto de hoje e não
  pode consumir teto diário nem aparecer na análise por categoria.
- **Indicador que não dá para calcular explica POR QUE** (decisão D-14, 11/08/2026).
  Booleano mudo (`mesesDeReservaDesconhecido: true`) faz o copiloto inventar a causa —
  aconteceu em produção: ele culpou os custos fixos com 12 cadastrados. Toda saída de
  ferramenta que devolve `null` carrega o motivo em texto. Ver `MOTIVOS` em
  `application/ia/ferramentas/patrimonio.ts`.
- **Número derivado viaja com suas partes** (decisão D-15, 11/08/2026). Corolário
  da D-14 para o caso em que o número EXISTE. `verbaVariavel` saía como átomo, e o
  copiloto negou ao dono que a meta de poupança já estivesse descontada — negou um
  fato do próprio motor. `composicaoDaVerba` (`ferramentas/saida.ts`) manda renda,
  poupança, fixos, provisão e rollover junto da verba, com a fórmula em texto.
  Cuidado com rótulo ambíguo: "antes de descontar parcela" foi lido como "nada foi
  descontado ainda". O erro que isso causa é **dupla contagem** — separar a meta
  outra vez a partir da verba livre.
- **Dinheiro sai por três caminhos, e só dois criam `Transacao`** (importação de
  fatura, 25/08/2026 — espelho da §11.2 do `TASKS-GRAFO.md` do lado da despesa):

  | Dinheiro sai por | Cria `Transacao`? | Já foi descontado da verba? |
  |---|---|---|
  | Gasto variável / parcela | **sim** | não — a `Transacao` é que consome o teto |
  | **Custo fixo** | **não** | **sim** — congelado em `Ciclo.fixosCents` quando o ciclo nasce |
  | Gasto de provisão | sim, com `provisaoId` | sim — abate `ProvisaoAnual`, e o motor exclui `provisaoId != null` |

  Quem só conhece a primeira linha desta tabela **conta o custo fixo duas vezes**.
  É o risco R1 do `TASKS-IMPORTACAO.md`: uma linha de fatura que casa com custo
  fixo vira `marcarCustoFixoPago` (rastreamento puro), **nunca** `criarTransacao` —
  fazer isso duplicaria R$ 4.884/mês e derrubaria o teto diário. A guarda é teste,
  não comentário (`domain/finance/importacao.test.ts` e
  `application/importacao/confirmar.test.ts`).

- **Parcela NÃO é deduzida da verba** (decisão D-11, 04/08/2026). Cada parcela é uma
  `Transacao` DESPESA de grupo `VARIAVEL` e **consome** o teto diário como qualquer
  outro gasto. Quem subtrair parcela dentro de `verbaVariavelCents` a conta duas vezes.
  Onde o usuário precisa saber "quanto sobra de verdade", o número é
  `verbaLivre = verbaVariavel − parcelasComprometidas`, exposto como campo **separado**
  (ver `src/domain/finance/projecao-tipos.ts`), nunca embutido na verba.

## Arquitetura (hexagonal / ports & adapters)

O `SPEC` fala em `lib/finance/`; aqui isso mora em **`src/domain/finance/`** dentro de
uma estrutura hexagonal para manutenção:

```
src/
  shared/            Kernel puro, agnóstico de domínio e framework.
    dinheiro.ts        formatBRL, parseBRL, ratearCents, somaCents (centavos Int)
    data.ts            datas civis: hoje, parseData, addDias/Meses, diffDias, ...
  domain/
    model/             Tipos puros do domínio (não dependem do Prisma).
      enums.ts           uniões de string (TipoTransacao, GrupoCategoria, ...)
      entidades.ts       Config, Conta, Transacao, Ciclo, ... (espelham o schema)
    finance/           >>> MOTOR DE CÁLCULO (SPEC seção 5) — funções PURAS + testes <<<
      ciclo.ts           limitesCiclo, diasTotaisCiclo
      verba.ts           provisaoMensal, poupancaAlvo, verbaVariavel
      teto.ts            gastoRealizado, calcularTeto, tetoDoDia
      ritmo.ts           indicadores da tela do ciclo
      recuperacao.ts     modo recuperação (saldo <= 0)
      parcelamento.ts    gerarParcelas
      analise.ts         analiseCategoria, detectarAssinaturas
      patrimonio.ts      totais, variação, meses de reserva
    ports/             Interfaces (a fronteira). O domínio depende só disto.
      relogio.ts         RelogioPort (provider de "hoje")
      repositorios.ts    *Repository (implementados pelos adapters na Fase 2+)
  infrastructure/      Adapters concretos.
    persistence/prisma.ts   singleton do Prisma Client
    relogio/relogio-sistema.ts  RelogioSistema (+ RelogioFixo p/ testes)
  application/         Casos de uso (Fase 2+): orquestram ports + motor. Ainda vazio.
prisma/                schema.prisma + seed.ts
```

**Regra de dependência:** `domain` nunca importa `infrastructure` nem `@prisma/client`.
Adapters implementam as portas; casos de uso recebem portas por injeção e chamam o motor.

## Comandos

```bash
pnpm test          # Vitest (motor de cálculo) — deve ficar 100% verde
pnpm typecheck     # tsc --noEmit — zero erros, zero any
pnpm db:generate   # gera o Prisma Client
pnpm db:migrate    # NÃO FUNCIONA neste repo — ver "Migrações" abaixo
pnpm db:seed       # Config singleton + contas base + categorias BR (idempotente)
```

### Migrações — `prisma migrate dev` não funciona aqui

`pnpm db:migrate` aborta com **P3006**: a migração `20260804200000_multi_tenant_dono_id`
depende de dados (exige um OWNER já existente) e o shadow database do Prisma nasce vazio,
então ela falha ao ser reaplicada lá. Não é defeito da sua mudança — é permanente.

**Como migrar de verdade** (padrão já usado em `20260811120000_item_patrimonio_conta` e
`20260824120000_fecha_arestas_categoria_estorno_rollover`):

1. Escrever o `migration.sql` à mão em `prisma/migrations/<timestamp>_<nome>/`.
2. Aplicar com `prisma db execute`.
3. Registrar com `prisma migrate resolve --applied <nome>`.
4. Conferir com `prisma migrate diff` — há um falso positivo conhecido no índice HNSW do
   pgvector (`DROP INDEX "Memoria_embedding_hnsw_idx"`), que é esperado e pode ser ignorado.

Escrever SQL à mão tem uma consequência que o `migrate dev` esconderia: **a ordem das
operações é sua responsabilidade**. Limpar órfãos ANTES de criar a FK, e o `EXISTS` da
limpeza precisa incluir `donoId` — não só o id — senão sobra lixo de aresta cruzando donos.

O banco é um **PostgreSQL 16 local** (Homebrew, `brew services start postgresql@16`),
database `financial_dev`. `DATABASE_URL` em `.env` aponta
`postgresql://<usuário>@localhost:5432/financial_dev?schema=public`.

Migrado de SQLite em 03/08/2026 — o arquivo `./data/app.db` não é mais fonte de
verdade. `./data/` agora guarda só os snapshots de segurança que o import de backup
grava antes de sobrescrever. Ao contrário do SQLite, o Postgres **impõe as foreign
keys**: `Config.destinoSobraContaId` exige a conta existente, então a ordem de
inserção em qualquer carga é contas/categorias → Config → resto.

## Ordem de implementação (SPEC seção 10) — não pular fases

Fase 0 ✅ · Fase 1 ✅ · Fase 2 Config · Fase 3 Ciclo+lançamento+Hoje · Fase 4 Ciclo ·
Fase 5 Fechamento · Fase 6 Análise · Fase 7 Patrimônio · Fase 8 Polimento.
