# Roadmap da API do agente — Fase 2 (planejamento, não implementação)

Este documento é só plano. Nenhum item aqui foi implementado — é o material
de referência para abrir os PRs quando a Fase 2 começar. Cada seção segue o
mesmo formato: o que é, impacto no schema, impacto no motor de cálculo,
riscos concretos, endpoints novos, e onde entra na sequência de PRs.

Lembretes que valem para os quatro itens:

- Migração aqui nunca é `prisma migrate dev` (falha com P3006 — a migração
  `20260804200000_multi_tenant_dono_id` exige um OWNER já existente e o
  shadow database nasce vazio). Todo schema novo é SQL escrito à mão em
  `prisma/migrations/<timestamp>_<nome>/migration.sql`, aplicado com
  `prisma db execute` e registrado com
  `prisma migrate resolve --applied <nome>`.
- Toda tabela financeira nova nasce com `donoId` + índice, e toda unicidade
  dela é composta com `donoId` (regra de ouro do multi-tenant) — um usuário
  nunca pode bloquear o nome/data/código de outro.
- Nenhum item deste roadmap toca `domain/finance/` sem teste puro cobrindo a
  mudança — é a mesma régua da Fase 1.

## 1. PJ/PF

**O que é**: separar as finanças de pessoa física das de pessoa jurídica
dentro da mesma conta de dono — hoje `Config` é singleton por `donoId` e
representa UMA renda, UMA meta, UM ciclo.

**Impacto no schema**: não é um campo raso. Um PJ real tem renda, custos
fixos, provisões e ciclo PRÓPRIOS — se `entidade: 'PF' | 'PJ'` for só um
filtro de exibição em `Conta`/`Transacao`, a verba de um vira contaminada
pela outra (ex.: custo fixo de PJ entrando no `fixosCents` congelado do
ciclo de PF). O modelo correto é `Config` deixar de ser singleton por
`donoId` e passar a ser singleton por `(donoId, entidade)` — o que por
sua vez implica `Ciclo`, `CustoFixo`, `ProvisaoAnual` e `Categoria` (grupo
`FIXO`/`RENDA`) ganharem `entidade` e toda query/unicidade que hoje é
`(donoId, …)` passar a ser `(donoId, entidade, …)`. `Conta` e `Transacao`
ganham `entidade` para saber de qual "livro" cada lançamento faz parte —
mas o campo nelas é consequência do modelo, não a causa.

**Impacto no motor**: é o item de maior raio. `ciclo.ts` (limites/duração
do ciclo por entidade), `verba.ts` (hoje assume UMA `Config` — passa a
receber a `Config` da entidade certa), `teto.ts` e `ritmo.ts` (tetos
independentes por entidade — gasto de PJ nunca pode consumir o teto diário
de PF), `recuperacao.ts` (modo recuperação é por entidade, não por dono).
Toda função pura de `domain/finance/` que hoje recebe `Config`/`Ciclo`
continua recebendo exatamente isso — a mudança é em QUAL `Config`/`Ciclo`
a camada de aplicação busca antes de chamar o motor, não na assinatura das
funções puras. Ainda assim é reescrita de verdade em `application/hoje.ts`,
`application/projecao.ts` e `application/fechamento.ts`, que hoje assumem
"o" ciclo do dono.

**Riscos concretos**:
- Dupla contagem se a migração dos dados existentes não atribuir TODO
  registro histórico a `entidade: 'PF'` de forma explícita antes de
  qualquer PJ existir — um `NULL`/default errado mistura histórico.
  `rollover` (`Ciclo.rolloverRecebidoCents`) por entidade: se o cálculo de
  fechamento ler o ciclo anterior sem filtrar por entidade, a sobra de PJ
  vaza pro rollover de PF.
- `destinoSobraContaId` (Config) e `ItemPatrimonio.contaId` cruzando
  entidades: uma conta PJ pode acabar como destino de sobra de PF se a UI/
  API não filtrar contas por entidade nos seletores.
- Análise/tendências/assinaturas (`analise.ts`) agregam por categoria sem
  noção de entidade hoje — precisam ganhar o filtro ou vão somar gasto de
  PJ dentro do "para onde vai a renda" de PF.

**Endpoints novos**: nenhum endpoint novo estrutural — os existentes
ganham `entidade` como query obrigatória (ou com default `'PF'` para não
quebrar clientes antigos) em `GET /transacoes`, `GET /contexto`,
`GET /ciclos`, `GET /contas`, `GET /custos-fixos`, `GET /provisoes`,
`GET /config`, `POST /transacoes`, `PATCH /config`, `POST /ciclos/atual/
fechar`. Única rota nova: `GET /entidades` (escopo `read`) listando quais
entidades o dono tem configuradas.

## 2. Multimoeda

**O que é**: transações em moeda estrangeira (ex.: renda em USD via Deel),
com conversão para BRL via PTAX do Banco Central.

**Impacto no schema**: `Transacao` ganha `moeda` (default `'BRL'`),
`valorOriginalCents` (o valor na moeda original, ainda `Int` em centavos
— ou "centavos" da moeda original, ex. cents de dólar) e `cotacaoEscalada`
(ver risco abaixo). Tabela nova `CotacaoCambio` (`moeda`, `data` "YYYY-MM-DD",
`cotacaoEscalada`, `fonte`) com unicidade composta `(donoId, moeda, data)`
— mesmo sendo dado de mercado e não "do dono", a regra de ouro não abre
exceção: se a tabela for compartilhada entre donos ela sai do escopo da
regra de isolamento e do `pnpm verificar:isolamento`, e um cache
desatualizado de um dono vira bug de outro. Mais simples e mais seguro
manter por `donoId` mesmo com alguma duplicação.

**Impacto no motor**: `valorCents` (BRL, o que o motor inteiro já consome)
continua sendo a ÚNICA fonte que `teto.ts`/`verba.ts`/`analise.ts` leem —
eles nunca precisam saber que existe `valorOriginalCents`. A conversão
acontece ANTES de a `Transacao` nascer (na Server Action/rota, não no
motor) ou — mais correto — num campo calculado gravado na criação
(`valorCents = round(valorOriginalCents * cotacaoEscalada / FATOR)`), nunca
recalculado em runtime a partir de uma cotação que pode mudar depois. Isso
é o análogo direto da regra "a verba do ciclo é congelada" (D-16):
cotação de HOJE não pode reprecificar uma transação de ontem.

**Riscos concretos**:
- **Cotação nunca é float** — regra inviolável do CLAUDE.md não abre
  exceção para câmbio. Representar USD/BRL = 5,2347 como inteiro escalado
  por um fator fixo e documentado, ex. `cotacaoEscalada: 52347` com fator
  `10_000` (`cotacaoEscalada: Int`, `FATOR_COTACAO = 10_000` em
  `shared/dinheiro.ts`, ao lado de `formatBRL`). Qualquer divisão usa
  `Math.round`, nunca trunca silenciosamente — arredondamento de centavos
  em conversão de moeda é exatamente o tipo de erro que some na soma e
  aparece só na conciliação.
- Em qual moeda a verba do ciclo é calculada quando `Config.rendaBaseCents`
  é parte BRL, parte USD: a resposta mais simples (e a única compatível
  com "verba congelada") é a verba SEMPRE em BRL, com a renda estrangeira
  convertida pela PTAX do dia em que o ciclo nasce — e congelada dali, como
  qualquer outro valor do ciclo. Se a PTAX do Bacen não devolver cotação
  para uma data (feriado/fim de semana), precisa de regra explícita de
  fallback (última cotação disponível) documentada, não "null" silencioso
  (D-14).
- Fonte externa (API do Bacen) é ponto de falha novo numa rota de ESCRITA
  (criar transação em moeda estrangeira) — precisa de cache local
  (`CotacaoCambio`) com fallback claro quando a API externa está fora, e
  decisão explícita: bloqueia a transação ou aceita com cotação defasada
  marcada como tal?

**Endpoints novos**: `GET /cambio?moeda=USD&data=YYYY-MM-DD` (escopo
`read`, lê o cache local e busca na PTAX se faltar) e `POST /transacoes`
passa a aceitar `moeda`/`valorOriginalCents` opcionais (continua retornando
`valorCents` em BRL, que é o que todo o resto da API já consome).

## 3. Entidade `Cartao`

**O que é**: cadastro de cartão de crédito (nome, limite, dia de
fechamento, dia de vencimento), ligado a transações `metodo: CREDITO` e a
parcelamentos, com endpoint de fatura atual/próxima.

**Impacto no schema**: tabela `Cartao` (`nome`, `limiteCents`,
`diaFechamento`, `diaVencimento`, `contaId` opcional — cartão pode ou não
estar ligado a uma conta de pagamento), unicidade `(donoId, nome)`. `Transacao`
e `Parcelamento` ganham `cartaoId` opcional (nullable — nem toda despesa
`CREDITO` precisa estar ligada a um cartão cadastrado, mesma lógica de
`contaId` nullish hoje).

**Impacto no motor**: este é o ponto mais sutil do roadmap inteiro.
`parcelamento.ts` hoje gera parcela com competência `dataCompra + k meses`
(clamp de fim de mês) — ou seja, a COMPETÊNCIA de uma parcela é sempre
relativa à data da compra, não ao ciclo de fatura do cartão. Introduzir
`diaFechamento` não deveria mudar essa função pura: uma compra feita depois
do fechamento vira fatura do mês seguinte no BANCO, mas a competência
financeira do app (regra 2: data civil, mês de referência da compra) pode
continuar sendo a da compra — o "mês da fatura" é um dado DERIVADO para
exibição (`GET /cartoes/{id}/fatura-atual`), calculado por uma função nova
e pura em `domain/finance/` (ex. `cartao.ts::mesDaFatura(dataCompra,
diaFechamento)`), nunca uma reescrita de `gerarParcelas`. Se a decisão de
produto for a oposta — competência REAL desloca pro mês da fatura — isso é
mudança de regra de negócio (CLAUDE.md regra 2 e D-11) e precisa de
decisão explícita antes de codar, não decisão implícita dentro da função.

**Riscos concretos**:
- `Cartao` não substitui `metodo: CREDITO` — `metodo` em `Transacao` já
  existe e é obrigatório conceitualmente (PIX/DEBITO/CREDITO/DINHEIRO/
  BOLETO); `cartaoId` é um refinamento OPCIONAL de `metodo: CREDITO`
  (qual cartão, entre vários). Confundir os dois (ex.: inferir `metodo`
  a partir de `cartaoId` presente) quebra transações `CREDITO` sem cartão
  cadastrado, que são o caso comum hoje.
- "Fatura atual/próxima" como endpoint de LEITURA pura — nunca gera
  `Transacao` nem fecha nada; é só agregação de transações já lançadas por
  `cartaoId` + janela de fechamento. Se for implementado como efeito
  colateral de uma escrita, duplica o paradigma "custo fixo nunca cria
  Transacao" ao contrário (criaria uma Transacao-fatura virtual).
- Limite de cartão (`limiteCents`) é informativo, não bloqueante — este
  app é um LIMITADOR de gasto via teto diário (SPEC), não um validador de
  limite bancário; tentar bloquear lançamento por limite de cartão
  colidiria com a regra "nunca bloquear lançamento de gasto" (CLAUDE.md
  regra 8).

**Endpoints novos**: `GET /cartoes`, `POST /cartoes`, `PATCH /cartoes/{id}`
(escopos `read`/`write`/`write`), `GET /cartoes/{id}/fatura-atual` e
`GET /cartoes/{id}/fatura-proxima` (escopo `read`).

## 4. Importação OFX/CSV

**O que é**: reaproveitar o motor de conciliação de `src/application/
importacao/` (hoje: texto colado ou PDF em base64, extração por IA) para
dois formatos estruturados — OFX (extrato bancário) e CSV (fatura de
cartão em formato tabular).

**O que muda**: só a etapa de EXTRAÇÃO. Hoje `criarImportacao` manda texto
livre pra IA extrair itens (descrição, valor, data) antes de conciliar.
OFX e CSV já chegam estruturados — a extração vira um parser determinístico
(sem IA, sem custo de tokens, sem o risco de a IA "inventar" um item que
não existe no extrato) que produz a MESMA forma intermediária que a
extração por IA produz hoje. É literalmente um adapter novo atrás da MESMA
interface de entrada do pipeline de conciliação — não um pipeline paralelo.

**O que é idêntico**: a conciliação contra transações/parcelas/custos
fixos existentes (mesmo motor), a revisão em rascunho antes de gravar
(nada é gravado na extração — só no `aprovar`), a guarda "item que casa com
custo fixo vira `marcarCustoFixoPago`, nunca `criarTransacao`" (R1 da
Fase 1 de importação — é teste, não comentário, e continua sendo teste
aqui), o desfazer por reversão de cada linha pelo caminho que a criou, e a
idempotência por hash do conteúdo.

**Impacto no schema**: nenhum campo novo estrutural — `Importacao` ganha
só um `formato: 'TEXTO' | 'PDF' | 'OFX' | 'CSV'` (hoje provavelmente já
distingue texto/PDF por qual campo de entrada veio preenchido; formaliza
isso num enum em vez de inferir).

**Impacto no motor**: nenhum em `domain/finance/` — conciliação já vive em
`application/importacao/`, que é camada de aplicação, não motor puro. A
mudança é só a função de extração (`extrairItensDeOfx`/`extrairItensDeCsv`
em vez de `extrairItensComIA`), plugada no mesmo ponto do pipeline.

**Riscos concretos**:
- OFX tem variação de dialeto entre bancos (datas em formatos diferentes,
  `FITID` nem sempre estável) — parser precisa de teste com arquivo real
  de pelo menos 2 bancos antes de confiar na extração sem revisão humana
  no rascunho.
- CSV de fatura de cartão não tem schema universal (cada banco exporta
  colunas diferentes) — ao contrário do OFX (padrão), aqui provavelmente
  precisa de um mapeamento de colunas configurável por import, não um
  parser fixo.
- Sem IA na extração, perde a normalização "frouxa" que a IA fazia de
  graça (ex.: reconhecer que "UBER *TRIP" e "UBER TRIP HELP.UBER.COM" são
  o mesmo estabelecimento para fins de assinatura/categoria sugerida) —
  pode precisar de uma categorização sugerida mais fraca para itens vindos
  de OFX/CSV, e isso deveria ficar explícito pro agente (D-14: campo que
  não dá pra inferir diz por que, nunca inventa).

**Endpoints novos**: nenhum novo — `POST /importacao` ganha mais duas
formas de corpo na união já existente (`{ ofx: string, competenciaRef }` /
`{ csv: string, mapeamentoColunas, competenciaRef }`), mesmo escopo
`write`, mesmo pipeline de aprovar/desfazer.

## Ordem sugerida dos PRs

1. **Importação OFX/CSV** primeiro — menor risco, zero mudança de schema
   estrutural, zero mudança no motor de cálculo, reaproveita um pipeline
   que já tem teste e já provou a guarda R1 em produção. É o PR mais
   barato de revisar e o que menos pode quebrar algo que já funciona.
2. **Entidade `Cartao`** em seguida — schema novo isolado (tabela nova,
   FK opcional em duas tabelas existentes), sem alterar nenhuma função
   pura de `domain/finance/` se a decisão "mês da fatura é derivado, não
   competência" for respeitada. Depende logicamente de nada dos outros
   três, mas é mais fácil de revisar com a disciplina de importação ainda
   fresca (os dois tocam `Transacao`).
3. **Multimoeda** depois — mexe em `Transacao` (campo novo) e introduz uma
   fonte de dado externa (PTAX), mas ainda não precisa tocar
   `domain/finance/` se a conversão acontece na borda. Fazer depois de
   `Cartao` evita dois PRs grandes competindo por mudança no mesmo
   schema de `Transacao` ao mesmo tempo.
4. **PJ/PF por último** — de propósito. É o único item que exige
   reescrever a noção de "o" ciclo/config/verba do dono para "o ciclo da
   entidade do dono", tocando `application/hoje.ts`, `application/
   projecao.ts`, `application/fechamento.ts` e várias funções de
   `domain/finance/`. Fazer isso depois dos outros três evita que cada um
   deles precise ser retrofitado com `entidade` no meio do caminho — eles
   nascem já sabendo que `entidade` existe (ainda que só com `'PF'` até
   este PR chegar), em vez de ganhar essa dimensão depois.
