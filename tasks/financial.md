# financial — Estado Atual

**Atualizado**: 2026-08-10

## Concluido recentemente
- **Plano `TASKS-CUSTOS.md`** (raiz): CRUD visual de custos (fixos, parcelados, variáveis)
  + tela de projeção. Consolidado de dois estudos paralelos (arquitetura + UX/UI), com
  11 fases, wireframes, microcopy PT-BR e paleta validada pelo dataviz.
- **Descoberta que encurtou o escopo**: o motor de projeção JÁ EXISTIA
  (`domain/finance/projecao.ts` + `application/projecao.ts`), consumido só pelas
  ferramentas de IA. A Feature B é UI sobre motor pronto + 2 campos de saída.
- **Fase 1–2**: migração aditiva (`CustoFixo.vigenteDe/vigenteAte`,
  `Parcelamento.encerradoEm`) + portas/repositórios (`listarTodos`/`obter`/`excluir`,
  `listar`/`atualizar`, `listarPorParcelamento`, `contarPorCustoFixo`). 13 checagens
  novas em `verificar:isolamento`.
- **Fase 3**: primitivas `Tabs`, `Segmented`, `Table`/`SortableTh`, `ConfirmDialog`,
  `Toast` em `components/ui/index.tsx`; `tabCls()` ad-hoc migrado.
- **Fase 4**: `application/custos.ts` — listar/desativar/excluir custo fixo e provisão,
  com recusa acionável e tradução de FK P2003 no adapter. Auditada e corrigida.
- **Fase 5**: `application/parcelamentos.ts` — listar/encerrar/editar, guarda de
  retroatividade extraída para `application/retroatividade.ts`. Auditada e corrigida.
- **Backup teria quebrado**: schemas zod de import usam `.strict()`, que REJEITA chave
  desconhecida — backup gerado após a migração falharia ao importar. Corrigido.
- Portões: `tsc` limpo · **770 testes** verdes · `next build` verde · isolamento OK.

## Pendente
- **NADA FOI COMMITADO** — ~21 arquivos modificados + 5 novos acumulados.
- **`.env.example` tem `admin123` e email real no working tree** (arquivo RASTREADO —
  se commitar, credencial entra no histórico para sempre). Não foi mexido por mim.
- **Fase 6** — domínio da projeção: `fixosVigentesNoCicloCents` (param opcional em
  `projetarCiclos`, para compatibilidade), `obrigacoesDoCiclo` + `terminamNesteCiclo`
  em `CicloProjetado`, `periodoLabel`.
- **Fases 7–11**: telas `/custos/{fixos,parcelados,variaveis}`, `/projecao`, e prévia de
  impacto no modal de parcelamento (usa `projetarComCenario`, que já existe).
- **Pré-condição da Fase 9**: extrair `ExtratoVariaveis` com prop `escopo` e o form de
  edição duplicado entre `transacao-linha.tsx`/`extrato-variaveis.tsx` — senão vira a
  terceira cópia do mesmo markup.
- Validação visual do `Segmented`/`Toast` no navegador: passou em `/config`, home
  desktop e mobile, `/ciclo`. Nenhum hydration mismatch das primitivas novas.
- Fase E (memória do copiloto) e D6/D7 seguem como estavam.

## Bugs conhecidos
- **Hydration mismatch em `/patrimonio`** (pré-existente):
  `components/patrimonio/novo-snapshot-form.tsx:25` usa `crypto.randomUUID()` dentro do
  inicializador de `useState` → ids diferentes servidor/cliente, `htmlFor` quebrado.
  Corrigir com `React.useId()`.
- **Sem transação de banco** em `encerrarParcelamento`/`regenerarParcelas`: reversão de
  saldo, de provisão e exclusão em 3 round-trips por parcela. Falha no meio credita
  saldo de parcela viva; retry credita de novo. Resolver junto com a Fase 8.
- `regenerarParcelas` descarta `contaId`/`provisaoId`. N+1 sequencial em
  `listarParcelamentos` (~13 + ~150 queries em série). `revalidatePath` de
  `actions/parcelamentos.ts` esquece `/analise` e `/fechar-ciclo`.
- `criarParcelamento` nunca valida o grupo da categoria (mesma lacuna que a edição fechou).

## Decisoes
- **`prisma migrate dev` é inutilizável neste repo**: o shadow DB replaya tudo num banco
  vazio e a migração multi-tenant aborta por `RAISE EXCEPTION` sem OWNER. Fluxo:
  `migrate diff` → escrever o SQL à mão → `db execute` → `migrate resolve --applied`.
  **`migrate diff` quer dropar `Memoria_embedding_hnsw_idx`** (pgvector, SQL cru) —
  nunca copiar o diff cru.
- **NUNCA rodar `pnpm build` com o dev server no ar** — mesmo `.next`, a app fica sem CSS
  (`layout.css` 404). Usar `NEXT_DIST_DIR=.next-verify pnpm build`. Já previsto no
  `next.config.ts`. Aconteceu de verdade em 10/08.
- **Excluir parcelamento = cancelar só as parcelas futuras.** Três condições simultâneas:
  `pagoEm == null` **e** fora de ciclo fechado **e** `data > hoje`. "Não paga" sozinho
  apagaria gasto passado que já caiu no cartão (o dono raramente marca como paga).
- **A categoria decide se o gasto conta como verba variável** (`contaComoVerbaVariavel`
  filtra por grupo). Editar categoria NÃO é cosmético: sem guarda, corrompia `sobraCents`
  de ciclo fechado. Teste de categoria precisa CRUZAR grupo, não só trocar id.
- **Teste de R1 precisa de ciclo fechado que cubra a data do relógio fake** — senão
  `obterAtual` nunca o alcança e o teste passa sem testar nada (aconteceu na Fase 4).
- **Botão "Excluir para sempre" era impossível**: FK `PagamentoFixo.custoFixoId` é
  `Restrict`. Com pagamento registrado só existe "Desativar".
- **Fake que diverge do adapter = teste verde + produção quebrada.** Os `salvar` dos fakes
  eram append-only e não geravam id; corrigidos nos quatro.
- **`Tabs` usa `<nav>` + `aria-current`, não `role="tablist"`** — as abas são links que
  navegam de verdade; o papel seria mentira. Bônus: continua Server Component.
- **Exportar de arquivo `'use server'` só vale para server action serializável** —
  `executarComConfirmacao` recebe callback, então foi para módulo plain.
- Decisões anteriores seguem valendo: D-11 (parcela consome a verba, não é deduzida),
  D-8 revisada (IA propõe, dono confirma), DA-3 (IA é OWNER-only com teto), número nunca
  entra na memória, multi-tenant escopado só em `composition.ts`, monolito hexagonal.

## Stack
- Next.js 15 (App Router) · React 19 · TypeScript estrito (zero `any`)
- PostgreSQL 16 local (`financial_dev`) + Prisma 6 + pgvector 0.8.6
- Vitest (770 testes verdes) · Tailwind 4 · lucide-react · recharts
- OpenAI SDK 7 (`gpt-5.6-terra` via Responses API) · zod + zod-to-json-schema
- Auth própria: Argon2id (`@node-rs/argon2`), sessão em cookie opaco, papéis OWNER/VIEWER
- Arquitetura hexagonal: `shared/` → `domain/` (model, finance, auth, ports) →
  `application/` (casos de uso) → `infrastructure/` (adapters) → `app/` (rotas)
