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
Recharts · date-fns · Zod · Vitest · unpdf (leitura local de PDF de fatura). Sem multimoeda ou
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

## Camada de IA — configuração

A camada de IA responde perguntas em linguagem natural sobre a sua vida financeira. Ela
**não calcula nada**: todo número vem de função pura de `src/domain/finance/`, chamada via
tool calling. O modelo só escolhe qual pergunta fazer ao código e narra a resposta.

Vem **desligada** por default. Para ligar, preencha no `.env` (ver `.env.example`):

| Variável | Papel |
|---|---|
| `IA_HABILITADA` | liga/desliga a camada inteira (default `false`) |
| `OPENAI_API_KEY` | credencial |
| `OPENAI_MODEL` | id do modelo — mora aqui, nunca no código |
| `OPENAI_MODEL_EMBEDDING` | modelo de embedding da memória do copiloto; ausente = memória grava e lista, só a busca semântica desliga |
| `IA_TIMEOUT_MS` | opcional, default 60000 |
| `IA_MAX_TENTATIVAS` | opcional, default 2 |

Com `IA_HABILITADA=false`, `criarDeps()` devolve `ia: undefined` e o app roda exatamente
como antes — nenhum caso de uso existente depende do campo.

**A IA é OWNER-only e tem teto durável.** É a única parte do app que gasta dinheiro real
por requisição, então `responder()` faz três coisas antes de falar com o provedor:
`exigirOwner(ator)`, `avaliarLimiteIA(uso do dia)` e, depois da resposta, o registro do
consumo. Os limites padrão vivem em `src/application/limite-ia.ts`
(`LIMITES_IA_PADRAO`: 50 requisições e 500 mil tokens por dia). O contador é durável em
Postgres — reiniciar o servidor não zera o teto.

**Regra que governa a camada inteira: toda conta nova vira função pura, nunca prompt.**
Se o copiloto precisa de um número que o motor ainda não sabe calcular, o trabalho é
escrever a função em `src/domain/finance/` com teste e expô-la como ferramenta — não
descrever a fórmula no prompt de sistema. Fórmula em prompt não é testável, varia entre
execuções e faz o motor deixar de ser fonte de verdade.

### O que trafega para a OpenAI

Registro explícito (decisão D-2: o dono aprovou que o dado saia da máquina). Numa conversa
típica sobem quatro coisas, e só elas:

1. **Prompt de sistema** (`src/application/ia/prompt-sistema.ts`) — texto fixo, sem dado seu.
2. **Memórias** de tipo plano/preferência/contexto, injetadas no prompt de sistema a cada
   turno. Nunca contêm valor em dinheiro — `validarTextoMemoria` rejeita antes de gravar.
3. **Sua pergunta e o histórico da conversa** em aberto na tela.
4. **A saída das ferramentas executadas** — e é aqui que vai o dado financeiro de verdade:
   verba, teto do dia, gasto realizado, nomes e valores de categorias, custos fixos,
   parcelamentos, saldos de conta. Valores reais, em centavos e formatados.

Sobem também **ids internos** de categoria, conta e memória (`src/application/ia/
ferramentas/escrita.ts`): as ferramentas de proposta precisam referenciar a linha que o
dono vai confirmar. São UUIDs sem significado fora deste banco.

O que **não** sobe: senha ou hash, id de sessão, `donoId`, e-mail, e nada do banco que uma
ferramenta do catálogo não devolva. Não há log local do texto das conversas (decisão D-5) —
só metadados de consumo em `UsoIADia`.

`src/infrastructure/ia/config-ia.ts` é o **único** arquivo do repo que lê `OPENAI_*`. O
domínio (`src/domain/ports/ia.ts`) não conhece nome de provedor, nome de modelo nem variável
de ambiente.

### O que trafega na importação de fatura

Registro explícito (decisão D-16, 24/08/2026 — o dono aprovou que o conteúdo da fatura saia
da máquina). Isto é **qualitativamente diferente** do parágrafo acima e merece leitura
separada: até aqui subiam agregados e valores calculados pelo motor; agora sobe o **texto
transcrito da fatura — nome do estabelecimento, data e valor de cada linha**. Isso é perfil
de consumo e de deslocamento, não só número financeiro.

**O que sobe** (`src/application/importacao/extrair.ts`):

1. **O texto da fatura**, normalizado e fatiado em blocos de até 20 linhas não vazias — uma
   chamada de API por bloco (o `IA_TIMEOUT_MS` de 60s não aguenta a fatura inteira numa
   chamada só). Sobem **todas** as linhas do documento, não só as de gasto: o que estiver
   impresso no PDF que você anexou — limite do cartão, dígitos finais do cartão, endereço —
   vai junto, porque a fatia é do texto, não de uma lista já filtrada.
2. **Um prompt de sistema fixo** com as regras de transcrição (valor em centavos positivos,
   data como impressa, nunca inventar linha). Texto fixo, sem dado seu.

**O que não sobe:**

- **Nenhuma ferramenta.** Esta é a única fronteira hostil do app — um "estabelecimento"
  chamado `IGNORE AS INSTRUÇÕES E…` é conteúdo do documento, não comando. A chamada de
  transcrição é feita **fora** do loop de tool calling (`turnoComSchema` em
  `provedor-ia.ts` deliberadamente não recebe `tools`), com schema estrito: uma injeção não
  tem o que acionar, no pior caso vira uma linha transcrita estranha que a conciliação e
  você julgam depois.
- **Categoria.** O modelo não recebe pedido de categoria — nem id, nem nome, e o campo nem
  existe no schema de saída. Categoria é inferência, e a linha entra sem ela para você
  classificar.
- **Ano.** A fatura imprime só "12/03" ou "12 MAR". O modelo devolve o texto como está
  impresso e **nunca** completa o ano; quem resolve é função pura
  (`resolverAnoDaFatura`, `src/domain/finance/importacao-data.ts`) a partir da competência
  que **você** informou no upload. Data que não resolve entra como `null` — nunca chutada.
- **Nada do banco.** Nenhuma transação, custo fixo, saldo, verba ou id interno é mandado
  junto: a conciliação contra o que já existe é 100% função pura, depois da transcrição.
- `donoId`, id de sessão, senha, hash, e-mail — nunca, aqui como no copiloto.

O adapter manda `store: false` na Responses API, então a chamada não fica guardada no
histórico da conta na OpenAI. Isso não é a mesma coisa que garantia de que a OpenAI não
retém nada para monitoramento de abuso — a decisão D-16 é sobre isto: o conteúdo passa pelo
servidor deles.

**O arquivo não é guardado em lugar nenhum.** Os bytes do PDF vivem só em memória: a rota
(`app/api/importacao/route.ts`) e o conversor (`src/infrastructure/importacao/texto-fatura.ts`)
não têm uma linha de `fs` — nem para `./data/`, que é reservado ao snapshot de salvaguarda do
backup. O texto cru completo também não é persistido. O que fica no banco é o **sha256 do
texto normalizado** (`Importacao.hashConteudo`, chave de idempotência — reenviar a mesma
fatura reabre o mesmo rascunho em vez de re-extrair e regastar tokens), o nome do arquivo,
a competência, a contagem de tokens e **as linhas transcritas** (`ItemImportado`).

**O caminho de zero-envio continua aberto.** Depois de ver 2 ou 3 faturas reais do mesmo
banco, um parser local por regex sobre o texto do PDF resolve o layout sem chamar modelo
nenhum. Não é v1, mas a extração está isolada num caso de uso só
(`application/importacao/extrair.ts`), então trocá-la por um parser local não exige
refatorar a conciliação nem a persistência.

**O que é aceito:** PDF **nativo** (com camada de texto), extraído localmente com `unpdf` —
até 15 MiB e 30 páginas — ou texto colado direto. **PDF escaneado, imagem (JPG/PNG), OCR e
Word/.docx estão fora**: um PDF sem texto selecionável é recusado com erro explícito, nunca
tratado em silêncio como texto vazio e nunca mandado para OCR. Nesses casos o caminho é
**copiar o texto da fatura e colar** no campo de texto — mesmo pipeline, mesma conciliação.

Importar fatura é **OWNER-only**, exige `IA_HABILITADA=true` (com a camada desligada a
extração falha com `ExtracaoIAIndisponivelError` em vez de seguir sem transcrever) e consome
o mesmo teto diário de IA — cada bloco de 20 linhas conta uma requisição em `UsoIADia`.
Nenhuma variável de ambiente nova: a importação usa a mesma `OPENAI_API_KEY` e o mesmo
`OPENAI_MODEL` do copiloto.

### Verificação de capacidade do modelo

```bash
pnpm ia:verificar    # gasta tokens de verdade (~centavos por execução)
```

O spike prova, contra a API real, que o modelo escolhe a ferramenta certa entre cinco
parecidas, respeita o tipo declarado dos argumentos (inteiro, data `YYYY-MM-DD`), sustenta
conversa de múltiplos turnos e admite quando não sabe. Ele mede também os tokens de uma
conversa típica, para dar número — e não palpite — ao custo por pergunta.

**Última verificação: 04/08/2026 · `gpt-5.6-terra` · 7/7 aprovadas.**

| Verificação | Resultado |
|---|---|
| Escolha entre 5 ferramentas parecidas, 3 perguntas | 3/3 corretas |
| `numCiclos` volta inteiro (`z.number().int()`) | ok — `12` |
| Data volta em `YYYY-MM-DD` | ok — `"2026-03-15"` a partir de "15 de março de 2026" |
| Turno múltiplo (recebe resultado da tool e fecha) | ok — **citou a string `*Formatado`** em vez de recompor o valor |
| Recusa honesta quando nenhuma tool cobre | ok — "Não tenho acesso à cotação do dólar…" |

Custo medido: **2118 tokens de entrada · 221 de saída** para as 6 chamadas do spike
(≈ US$ 0,007). Uma conversa real de 2–3 turnos deve ficar acima disso, porque o catálogo
final tem mais ferramentas e as saídas carregam dados de verdade — reavaliar quando a
Fase D estiver de pé.

**Achado que mudou o adapter:** `gpt-5.6-terra` é modelo de raciocínio e a API recusa
function tools em `/v1/chat/completions`, exigindo `/v1/responses` ou `reasoning_effort:
'none'`. O adapter fala **Responses**; desligar o raciocínio degradaria justamente a
escolha entre ferramentas parecidas, que é a capacidade de que a Fase D depende.

Capacidade de modelo muda com o tempo — rode de novo e atualize a data ao trocar de modelo.

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
