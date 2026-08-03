# Quanto posso gastar hoje

App pessoal (single-user, roda local) de controle financeiro. Não é um registrador de
gastos — é um **limitador**: responde uma pergunta por dia, *quanto eu posso gastar hoje
sem furar minha meta de poupança?* A poupança é tratada como conta a pagar, não como sobra:

```
renda − poupança − compromissos = quanto posso gastar
```

## Direção de design (o ponto de vista)

**Painel de instrumentos noturno.** Fundo quase-preto, neutros frios e quietos, um único
acento azul para interação e cores semânticas reservadas ao estado do dinheiro (verde =
folga, âmbar = no limite, coral = estouro/recuperação). Toda a ousadia é gasta num lugar
só — o número herói da tela Hoje, gigante e em figuras tabulares; todo o resto é
disciplinado e silencioso. Dark-first porque o app é aberto à noite, na fila do caixa.
(Deliberadamente evita os defaults de UI gerada por IA: nada de creme+serifada+terracota,
nada de preto+verde-ácido, nada de layout tipo jornal.)

## Stack

Next.js 15 (App Router) · React 19 · TypeScript strict · PostgreSQL via Prisma · Tailwind CSS v4 ·
Recharts · date-fns · Zod · Vitest. Sem autenticação, multiusuário, multimoeda ou
integração bancária (fora de escopo v1).

## Arquitetura (hexagonal / ports & adapters)

```
src/
  shared/          Kernel puro: dinheiro (centavos Int) e datas civis (string YYYY-MM-DD)
  domain/
    model/           Entidades e enums (não dependem do Prisma)
    finance/         MOTOR DE CÁLCULO — funções puras + testes (SPEC 5)
    ports/           Interfaces: repositories e relógio
  application/     Casos de uso: orquestram portas + motor (Hoje, Ciclo, Análise, ...)
  infrastructure/  Adapters: Prisma (repositories), relógio, backup
  actions/         Server Actions (validam com Zod, retornam { ok } )
  components/      UI (design system + telas)
app/               Rotas do App Router
prisma/            schema + seed
```

Regra de dependência: `domain` nunca importa `infrastructure` nem `@prisma/client`. A
composição (`src/composition.ts`) é o único lugar que conhece a infraestrutura concreta.

## Rodando

Requer um PostgreSQL local rodando:

```bash
brew install postgresql@16
brew services start postgresql@16
createdb financial_dev

cp .env.example .env  # ajuste o usuário na DATABASE_URL se necessário
pnpm install
pnpm db:migrate      # aplica as migrações no financial_dev
pnpm db:seed         # Config, buckets e categorias BR
pnpm dev             # http://localhost:3000
```

Primeiro acesso: a tela Hoje leva você para **Configuração** para preencher renda, dia de
recebimento e meta. Depois disso o app já é usável no dia a dia.

## Testes

```bash
pnpm test        # Vitest — motor de cálculo (SPEC 9)
pnpm typecheck   # tsc --noEmit, zero any
```

## Dados e backup

Os dados vivem num PostgreSQL local (database `financial_dev`). Em **Ajustes → Backup** você
exporta o estado completo em JSON e restaura quando precisar — a única garantia contra perda
de dados num app local. Antes de sobrescrever, o import grava uma salvaguarda do estado atual
em `./data/app.backup-<carimbo>.json` (git-ignored); se essa gravação falhar, o import aborta
sem escrever nada.

Para versionar remotamente (opcional), crie um repositório vazio e:

```bash
git remote add origin <url-do-repo>
git push -u origin main
```
