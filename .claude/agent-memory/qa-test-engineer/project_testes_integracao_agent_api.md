---
name: testes-integracao-agent-api
description: Como rodar testes de integração contra Postgres real para app/api/agent/v1/** — pipeline, armadilhas de setup e padrões de asserção que funcionaram de primeira
metadata:
  type: project
---

Em 04/11/2026 a suíte `src/agent-api/__integracao__/*.integracao.test.ts` (+
`vitest.integracao.config.ts`, script `pnpm test:integracao`) foi criada para
provar a API do agente (`app/api/agent/v1/**`, kernel `src/agent-api/`)
contra o Postgres REAL, chamando os route handlers (`GET`/`POST`/...
exportados de cada `route.ts`) direto, sem subir servidor.

**Resultado notável: isolamento entre donos passou de primeira em TODOS os
testes**, sem nenhum bug de produção encontrado. `rotaAgente`/`rotaEscrita`
+ `criarDepsAgente` (`src/composition.ts`) já escopam tudo corretamente. Não
assuma isso automaticamente numa rodada futura — é o estado em 04/11/2026,
confira de novo se a rodada seguinte achar algo.

## Pipeline que funciona

- `next/server` (`NextResponse`) importa e funciona fora de um servidor Next
  de verdade, desde que a rota NÃO toque `next/headers` (cookies) — a API do
  agente nunca usa `criarDeps()` (sessão por cookie), só `criarDepsAgente()`
  (token), então nenhuma rota de `app/api/agent/v1/**` precisa de mock de
  `next/headers`. Zero alteração de produção foi necessária.
- `new Request('http://localhost/api/agent/v1/...', { method, headers, body })`
  + `handler(req, { params: Promise.resolve({ id: '...' }) })` — Next 15 exige
  `params` como Promise no segundo argumento do Route Handler.
- Node 22+ (`.env` carregado com `process.loadEnvFile(new URL('../../../.env',
  import.meta.url))` num `setupFiles` do vitest) — `dotenv` não está
  instalado e não precisou ser adicionado.
- Config separada (`vitest.integracao.config.ts`, `pool: 'forks'`,
  `singleFork: true`, `fileParallelism: false`) rodando sequencial contra o
  mesmo banco. `vitest.config.ts` (suíte padrão) ganhou
  `exclude: ['**/*.integracao.test.ts']` para nunca tentar rodar isto sem
  banco.

## Armadilhas de setup (todas custaram pelo menos 1 rodada de teste falhando)

1. **`verbaLivreCents` (ciclo congelado) NÃO muda com uma despesa comum.**
   Ela só muda com parcelamento (D-11: `verbaLivre = verbaVariavel −
   parcelasComprometidas`). Para provar `impactoCiclo` com antes≠depois numa
   despesa normal, use `ritmoDiarioCents` (= `teto.tetoHojeCents`), não
   `verbaLivreCents`.
2. **`tetoHojeCents` exclui o gasto de HOJE por design** (SPEC 5.3: separa
   "teto do dia" de "o que já foi gasto hoje"). Uma despesa datada de HOJE
   não move `ritmoDiarioAntesCents`→`DepoisCents` no mesmo request. Date a
   transação de teste como `ontem(hoje('America/Bahia'))` (de
   `@/shared/data`), nunca hoje, para o before≠after aparecer.
3. **`categoriaId: null` SAI do cálculo de gasto.** `paraCalculo`
   (`src/application/mapeamento.ts`) mapeia `categoriaId: null` para
   `grupoCategoria: null`, e `contaComoVerbaVariavel` exige
   `grupoCategoria === 'VARIAVEL'`. Uma despesa de teste sem categoria não
   move `gastoRealizadoCents` nem `tetoHojeCents` — sempre passe uma
   categoria do grupo VARIAVEL (ex.: "Mercado", que `semearWorkspace` sempre
   cria) quando o teste depende do gasto mudando.
4. **Nenhuma rota de LEITURA da API do agente cria ciclo** (D-8: ler nunca
   tem efeito colateral — `lerCicloAtual`, não `garantirCicloAtual`). Para
   testar algo que depende de "há ciclo aberto", crie o ciclo explicitamente
   no setup chamando `garantirCicloAtual` (`@/application/ciclos`) via
   `criarDepsAgente`, depois de ajustar `Config.diaRecebimento`/
   `rendaBaseCents` direto no Prisma. `POST /ciclos/atual/fechar` É exceção:
   `obterResumoParaFechar` chama `garantirCicloAtual` por dentro, então criar
   o ciclo explícito no setup é opcional para esse endpoint específico.
5. **Rate limiter é singleton de MÓDULO** (`src/agent-api/limite-taxa.ts`,
   120 req/min por `tokenId`). Testar 429 exige um token DEDICADO que nenhum
   outro teste do arquivo/execução use — qualquer requisição anterior com o
   mesmo token conta para a janela.
6. **Lote "item inválido no meio" (`POST /transacoes/lote`)**: não há
   validação de negócio além de zod dentro de `criarTransacao` — um item com
   `contaId`/`categoriaId`/`provisaoId` inexistente vira violação de FK
   (Prisma P2003), que `LoteTransacaoFalhouError` envolve como QUALQUER
   `Error` (não só `NaoEncontrado*`) e a rota mapeia para 422
   `REGRA_DE_NEGOCIO` com `details.indice` correto. Zod puro (ex.:
   `valorCents <= 0`) falha ANTES do laço, pro corpo INTEIRO, sem índice —
   são dois testes diferentes, não um.

## Padrão de guarda de isolamento (reusável)

`helpers.ts` expõe `iniciarGuardaDeIsolamento()`: conta linhas de todas as
tabelas financeiras + `ApiToken`/`AuditoriaAgente`/`IdempotenciaAgente` ANTES
de qualquer dono de teste nascer; `afterAll` apaga os donos de teste
(`apagarDonoDeTeste` = `prisma.usuario.deleteMany` — cascade do schema leva
tudo) e confere que a contagem voltou exatamente ao que era. Qualquer arquivo
novo de teste de integração deve envolver o próprio corpo nisso — é o que
prova que os dados reais do dono ficaram intactos sem precisar comparar
manualmente tabela por tabela.

`scripts/verificar-isolamento.ts` foi estendido na mesma sessão com a seção
"API DO AGENTE" (token/auditoria/idempotência) seguindo o padrão já
estabelecido no arquivo — ver ali para o padrão de `checar`/`esperaErro`.
