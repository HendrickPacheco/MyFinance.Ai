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
  Fechamento (`/fechar-ciclo`), Configuração (`/config`), Backup (`/config/backup`).
- Banco: **PostgreSQL local** (`financial_dev`), migrado do SQLite em 03/08/2026.
- Em uso real, com dados do dono: renda R$ 30.000, meta R$ 18.000, 10 custos fixos
  (R$ 4.884), 13 parcelamentos (R$ 4.393,88/mês), ciclo = mês civil (`diaRecebimento` 1).
- Motor: suíte Vitest verde · `tsc --noEmit` limpo · `next build` verde.

### Armadilha recorrente desta sessão

Mudou `prisma/schema.prisma`, `.env` ou rodou migração? **O dev server precisa ser
reiniciado** — o Prisma Client fica em memória e continua servindo o schema antigo. Dois
"bugs" já foram só isso. Recuperação: `pnpm db:generate && rm -rf .next && pnpm dev`.

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
7. Sem autenticação, multiusuário ou integração bancária na v1.
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
- **Sem piso diário hardcoded**: o teto é 100% derivado de renda − fixos − parcelas −
  provisão − poupança.

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
pnpm db:migrate    # cria/aplica migração (PostgreSQL local)
pnpm db:seed       # Config singleton + contas base + categorias BR (idempotente)
```

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
