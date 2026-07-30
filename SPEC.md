# SPEC — App de Controle Financeiro Pessoal

> **Para o implementador (Claude Code):** leia este documento inteiro antes de escrever código. A ordem de implementação da seção 10 não é sugestão — o motor de cálculo (Fase 1) precisa existir e estar testado antes de qualquer tela. Se algo aqui estiver ambíguo, pergunte antes de assumir.

---

## 1. Objetivo

App de uso pessoal (single-user, roda local) para controle financeiro diário. O produto não é um "registrador de gastos" — é um **limitador de gastos** que responde uma pergunta por dia: *quanto eu posso gastar hoje sem furar minha meta de poupança?*

### Princípio central (inverte a lógica de toda planilha comum)

```
ERRADO:  renda − gastos = poupança
CERTO:   renda − poupança − compromissos = quanto posso gastar
```

A poupança é tratada como uma conta a pagar com data de vencimento, nunca como sobra.

### Requisito de fricção (define o design)

O app precisa sobreviver ao segundo mês de uso. Isso impõe três orçamentos de tempo, que são requisitos funcionais:

- **30 segundos/dia:** ver o teto do dia + lançar um gasto. Se lançar um gasto levar mais de 3 toques, o design falhou.
- **5 minutos/semana:** conferir ritmo do ciclo.
- **30 minutos/mês:** fechar ciclo, atualizar patrimônio, recalibrar meta.

---

## 2. Stack

| Camada | Escolha | Observação |
|---|---|---|
| Framework | Next.js 15+ (App Router) | Server Components por padrão; Client Components só onde há interação |
| Linguagem | TypeScript strict | `strict: true`, sem `any` |
| Banco | SQLite via Prisma | Arquivo local `./data/app.db`; sem serviço externo |
| Estilo | Tailwind CSS v4 | |
| Componentes | shadcn/ui | Base, mas não deixe com cara de template — ver seção 11 |
| Gráficos | Recharts | Só onde gráfico agrega; a tela principal não tem gráfico |
| Datas | date-fns | Ver regra crítica de datas na seção 5.1 |
| Validação | Zod | Schemas compartilhados entre form e server action |
| Mutações | Server Actions | Sem API routes, exceto export/import |
| Testes | Vitest | Obrigatório para o motor de cálculo |

**Fora de escopo na v1:** autenticação, multiusuário, multimoeda, integração bancária / Open Finance, PWA, app mobile nativo, notificações push.

---

## 3. Conceitos do domínio

Antes do schema, os quatro conceitos que o código precisa modelar corretamente:

**Ciclo financeiro.** A unidade de tempo do app **não é o mês calendário**, é o intervalo entre um recebimento e o próximo (ex.: dia 5 a dia 4). Todo cálculo de teto, verba e análise opera sobre ciclos. Modelar por mês calendário quebra o app de quem recebe fora do dia 1º.

**Verba variável.** O único dinheiro realmente livre no ciclo. Tudo que não é verba variável está comprometido e não pode aparecer como disponível em nenhuma tela.

**Provisão anual.** Custos que existem mas não caem todo mês: IPVA, IPTU, seguro, manutenção do carro, dentista, presentes, viagem, troca de celular. Somados no ano e divididos por 12, viram custo fixo mensal. **Esta é a causa raiz do "estourei sem motivo em dezembro".** Não é feature opcional.

**Bucket (conta).** Separação física do dinheiro. A lógica só muda comportamento se o dinheiro estiver de fato separado — o limite precisa ser saldo insuficiente, não força de vontade. Mínimo de 4 tipos:

| Tipo | Função |
|---|---|
| `FIXOS` | Conta onde caem débitos automáticos e contas fixas |
| `VARIAVEL` | Dinheiro do dia a dia (conta secundária / pré-pago) |
| `RESERVA` | Emergência + acúmulo das provisões anuais |
| `INVESTIMENTO` | Longo prazo, não se toca |

---

## 4. Modelo de dados (Prisma)

Regras que valem para todo o schema:

- **Todo valor monetário é `Int` em centavos.** Nunca `Float`, nunca `Decimal` para dinheiro em trânsito. Nome do campo sempre termina em `Cents`.
- **Toda data-only é `String` no formato `YYYY-MM-DD`.** Nunca `DateTime` para datas civis (ver 5.1). `DateTime` só para `createdAt`/`updatedAt`.

```prisma
// Singleton (id = 1 sempre)
model Config {
  id                   Int      @id @default(1)
  rendaBaseCents       Int      // renda LÍQUIDA (o que cai na conta)
  rendaVariavel        Boolean  @default(false)
  diaRecebimento       Int      // 1-31, define o corte do ciclo
  metaPoupancaCents    Int      // valor absoluto
  metaPoupancaPercent  Float?   // alternativa; se preenchido, tem precedência
  moeda                String   @default("BRL")
  timezone             String   @default("America/Bahia")
  destinoSobra         String   @default("RESERVA") // RESERVA | INVESTIMENTO | ROLLOVER
  updatedAt            DateTime @updatedAt
}

model Conta {
  id             String  @id @default(cuid())
  nome           String
  tipo           String  // FIXOS | VARIAVEL | RESERVA | INVESTIMENTO
  saldoCents     Int     @default(0)
  incluiPatrimonio Boolean @default(true)
  arquivada      Boolean @default(false)
  transacoes     Transacao[]
  custosFixos    CustoFixo[]
}

model CustoFixo {
  id            String  @id @default(cuid())
  nome          String
  valorCents    Int
  diaVencimento Int     // 1-31
  ativo         Boolean @default(true)
  contaId       String?
  conta         Conta?  @relation(fields: [contaId], references: [id])
}

model ProvisaoAnual {
  id              String  @id @default(cuid())
  nome            String  // "IPVA", "Presentes de Natal"
  valorAnualCents Int
  mesEsperado     Int?    // 1-12, quando o gasto costuma acontecer
  acumuladoCents  Int     @default(0)
  ativo           Boolean @default(true)
}

model Categoria {
  id         String  @id @default(cuid())
  nome       String  @unique
  grupo      String  // VARIAVEL | FIXO | RENDA
  essencial  Boolean @default(false) // usado na análise de corte
  icone      String?
  cor        String?
  ordem      Int     @default(0)
  transacoes Transacao[]
}

model Transacao {
  id          String  @id @default(cuid())
  data        String  // YYYY-MM-DD — data de COMPETÊNCIA (quando o gasto ocorreu)
  valorCents  Int     // sempre positivo; o sinal vem do tipo
  tipo        String  // DESPESA | RENDA | TRANSFERENCIA | ESTORNO
  descricao   String?
  metodo      String? // PIX | DEBITO | CREDITO | DINHEIRO | BOLETO
  categoriaId String?
  categoria   Categoria? @relation(fields: [categoriaId], references: [id])
  contaId     String?
  conta       Conta?     @relation(fields: [contaId], references: [id])
  contaDestinoId String? // só para TRANSFERENCIA

  // Parcelamento
  parcelamentoId String?
  parcelamento   Parcelamento? @relation(fields: [parcelamentoId], references: [id])
  parcelaNum     Int?

  // Estorno: aponta para a transação original
  estornoDeId  String?

  cicloId     String?
  ciclo       Ciclo?  @relation(fields: [cicloId], references: [id])
  createdAt   DateTime @default(now())

  @@index([data])
  @@index([cicloId])
}

model Parcelamento {
  id              String @id @default(cuid())
  descricao       String
  valorTotalCents Int
  numParcelas     Int
  dataCompra      String
  categoriaId     String?
  transacoes      Transacao[]
}

// Snapshot dos parâmetros no início do ciclo — CONGELADO (ver 5.2)
model Ciclo {
  id                    String  @id @default(cuid())
  dataInicio            String
  dataFim               String
  rendaPrevistaCents    Int
  rendaRealizadaCents   Int?    // preenchido no fechamento
  poupancaAlvoCents     Int
  fixosCents            Int     // soma congelada
  provisaoMensalCents   Int     // soma congelada
  verbaVariavelCents    Int     // derivado e congelado
  fechado               Boolean @default(false)
  fechadoEm             String?
  sobraCents            Int?
  observacao            String?
  transacoes            Transacao[]

  @@unique([dataInicio])
}

model SnapshotPatrimonio {
  id         String @id @default(cuid())
  data       String @unique // YYYY-MM-DD, 1 por mês
  itens      ItemPatrimonio[]
  totalCents Int
}

model ItemPatrimonio {
  id         String @id @default(cuid())
  snapshotId String
  snapshot   SnapshotPatrimonio @relation(fields: [snapshotId], references: [id], onDelete: Cascade)
  nome       String
  classe     String // CONTA | RENDA_FIXA | RENDA_VARIAVEL | CRIPTO | IMOVEL | OUTRO
  valorCents Int
}
```

---

## 5. Motor de cálculo

Implementar em `lib/finance/` como **funções puras**, sem acesso a banco. Recebem dados, devolvem números. Toda função dessa pasta precisa de teste unitário. Nenhuma regra de cálculo pode viver dentro de componente ou server action.

### 5.1 Regra crítica de datas

Datas civis são strings `YYYY-MM-DD` do início ao fim. Não construa `new Date("2026-07-29")` para comparar dias — isso é interpretado como UTC e, no fuso do Brasil, retrocede um dia. Consequência real: um gasto lançado à noite entra no dia errado e o teto do dia seguinte sai furado.

- Comparação de datas: comparação lexicográfica de string (`"2026-07-29" < "2026-08-01"`).
- Aritmética de datas: `date-fns` com `parseISO` + `format`, sempre normalizando de volta para string.
- "Hoje" vem de uma única função `hoje()` que respeita `Config.timezone`. Nada de `new Date()` espalhado pelo código.

### 5.2 Congelamento do ciclo

Quando um ciclo é criado, os parâmetros são copiados para o registro `Ciclo` e **não mudam mais**. Se o usuário editar um custo fixo ou a meta de poupança no dia 20, isso afeta o **próximo** ciclo, não o atual.

Motivo: se a verba variável for recalculada dinamicamente a partir da config, editar qualquer parâmetro reescreve o passado, o teto diário muda retroativamente e o número perde credibilidade. Um número que muda sozinho não controla comportamento.

Deve existir uma ação explícita "recalcular ciclo atual", com aviso de que o histórico do ciclo será alterado.

### 5.3 Fórmulas

```ts
// Limites do ciclo a partir de uma data
// diaRecebimento=5, data=2026-07-20 → { inicio: "2026-07-05", fim: "2026-08-04" }
// Se o mês não tem o dia (ex.: 31 em fevereiro), usa o último dia do mês.
limitesCiclo(data: string, diaRecebimento: number): { inicio: string; fim: string }

// Provisão mensal
provisaoMensalCents = soma(provisoesAtivas.valorAnualCents) / 12   // arredonda pra cima

// Verba variável — o único dinheiro livre
verbaVariavelCents =
    rendaPrevistaCents
  − poupancaAlvoCents
  − fixosCents
  − provisaoMensalCents

// Gasto realizado no ciclo, líquido
// Conta APENAS tipo=DESPESA em categorias do grupo VARIAVEL.
// Subtrai ESTORNO. Ignora TRANSFERENCIA e RENDA por completo.
gastoRealizadoCents(cicloId, ateData: string): number

// TETO DO DIA — recalculado a cada dia, nunca fixo
diasRestantes  = diffDias(dataFimCiclo, hoje) + 1        // inclui hoje
gastoAteAntesDeHoje = gastoRealizadoCents(ciclo, ontem)
saldoDisponivel = verbaVariavelCents − gastoAteAntesDeHoje

tetoHojeCents   = floor(max(saldoDisponivel, 0) / diasRestantes)
gastoHojeCents  = gastoRealizadoCents(ciclo, hoje) − gastoAteAntesDeHoje
restaHojeCents  = tetoHojeCents − gastoHojeCents        // pode ser negativo
```

**O teto exclui o gasto de hoje.** Isso separa dois números que o usuário precisa ver distintos: *o teto de hoje* (quanto foi liberado) e *o que resta de hoje* (teto menos o que já gastou). Se o cálculo incluísse hoje, o teto encolheria a cada lançamento e o usuário nunca saberia qual era o alvo.

**O teto se auto-corrige.** Gastou R$ 200 num jantar hoje? O teto de amanhã cai sozinho, porque o divisor diminuiu e o saldo também. Teto fixo só informa que o usuário falhou; teto dinâmico diz o que fazer a partir de agora.

**O teto nunca inclui custos fixos ou provisão.** Se incluir, o app mostra como disponível dinheiro que já está comprometido.

```ts
// Indicadores de ritmo (tela do ciclo)
diasDecorridos     = diffDias(hoje, dataInicio) + 1
mediaDiariaReal    = gastoRealizado / diasDecorridos
tetoInicial        = verbaVariavelCents / diasTotaisCiclo
projecaoFechamento = mediaDiariaReal * diasTotaisCiclo
ritmo              = mediaDiariaReal / tetoInicial   // >1 = acima do sustentável
```

### 5.4 Modo recuperação

Quando `saldoDisponivel <= 0`, o app entra em modo recuperação. Não mostre teto negativo, não mostre R$ 0,00 sem contexto e **não** mostre mensagem de culpa.

Mostre:
1. O déficit em relação à verba (`saldoDisponivel` em módulo).
2. As duas saídas concretas, com números: (a) gasto zero pelos próximos N dias restantes, ou (b) puxar `X` da reserva e assumir meta de poupança reduzida em `X` neste ciclo.
3. Se o usuário escolher (b): registrar `TRANSFERENCIA` da reserva para a conta variável e recalcular. A decisão fica registrada no ciclo — o objetivo é ver o padrão no fechamento, não esconder.

### 5.5 Análise de corte

Lógica diferente do controle diário. Controle é diário; corte é análise sobre **média dos últimos 3 ciclos fechados**.

O alvo é **recorrência pequena, não gasto grande isolado**. R$ 40 de delivery 3x/semana = R$ 480/mês, mais que quase qualquer parcela que valeria renegociar. Por isso o ranking padrão é por total mensal, e cada linha mostra `frequência × ticket médio`, não só o total.

```ts
analiseCategoria(categoriaId, ultimosNCiclos = 3) => {
  totalMedioMensalCents
  frequenciaMedia            // nº de transações por ciclo
  ticketMedioCents
  custoAnualizadoCents       // totalMedioMensal × 12  ← usar como número de impacto
  tendencia                  // SUBINDO | ESTAVEL | CAINDO (compara 1º vs 3º ciclo)
  essencial                  // vem da Categoria
}
```

Detector de assinaturas: transações com mesmo valor e mesma descrição normalizada, em 3+ ciclos consecutivos → sinaliza como recorrência fixa disfarçada de variável, com o custo anualizado.

### 5.6 Patrimônio

Visão independente do fluxo de caixa — o app precisa das duas. Snapshot mensal, sempre no mesmo dia do mês.

```ts
totalPatrimonio      = soma(itens do último snapshot)
variacaoMensal       = total(mês) − total(mêsAnterior)
taxaAcumulacaoMedia  = média das variações dos últimos 6 snapshots
mesesDeReserva       = saldoContasReserva / custoMensalMedio(fixos + provisão + média variável)
```

`mesesDeReserva` é um número de destaque: traduz patrimônio em segurança. E a curva de patrimônio precisa estar visível com frequência — controle de gasto sem ver o patrimônio subir vira punição sem recompensa, e o usuário abandona o app em três meses.

---

## 6. Regras de negócio (casos que quebram implementações ingênuas)

| # | Caso | Regra |
|---|---|---|
| 1 | Transferência entre contas | `TRANSFERENCIA` **nunca** é despesa nem renda. Move saldo entre contas e não toca em nenhum cálculo de gasto. |
| 2 | Pagamento de fatura de cartão | É `TRANSFERENCIA` (conta → cartão). Se registrado como despesa, duplica todos os gastos do mês. |
| 3 | Regime de competência | A despesa conta na **data da compra**, não na data do pagamento. Almoço no crédito dia 28 consome o teto do dia 28. |
| 4 | Compra parcelada | Cria 1 `Parcelamento` + N `Transacao`, uma por ciclo, a partir do ciclo da compra. `valorParcela = floor(total/N)`, resto somado na **última** parcela para fechar exato. |
| 5 | Estorno / reembolso | `ESTORNO` com `estornoDeId`. Abate na **data da transação original** se ela existe (mantém o histórico do dia correto); senão, na data do estorno. |
| 6 | Renda variável | Se `rendaVariavel = true`, `rendaPrevistaCents` sugerida = **menor** dos últimos 6 ciclos (não a média). Planejar pelo mês bom é o que produz dívida no mês ruim. O usuário pode sobrescrever, com aviso. |
| 7 | Sobra no fechamento | `sobra = verbaVariavel − gastoRealizado`. Destino conforme `Config.destinoSobra`. Default `RESERVA`. `ROLLOVER` soma na verba do ciclo seguinte. |
| 8 | Gasto de provisão anual | Quando o IPVA é pago, é despesa **categorizada como provisão**, abate `ProvisaoAnual.acumuladoCents` e **não** consome verba variável. Se o acumulado for insuficiente, avisar e mostrar o rombo. |
| 9 | Edição retroativa | Editar transação de ciclo fechado exige confirmação e recalcula a sobra daquele ciclo. |
| 10 | Ciclo sem fechar | Se o usuário abre o app e o ciclo anterior não foi fechado, criar o novo ciclo automaticamente com os parâmetros vigentes e exibir aviso pendente de fechamento. **Nunca bloquear o lançamento de gasto por causa de pendência de fechamento** — bloquear é o que faz o usuário abandonar. |
| 11 | Arredondamento | Sempre centavos inteiros. Divisão usa `floor` e o resto vai para o último elemento. A soma das partes tem que bater com o total, sempre. |
| 12 | Meta irreal | Se `verbaVariavelCents / diasCiclo` cair abaixo de um piso configurável (default R$ 15/dia), avisar na configuração: meta ambiciosa demais gera teto irreal → furo → frustração → abandono. Sugerir a meta que o usuário bateu com folga nos últimos 2 ciclos. |

---

## 7. Rotas e telas

```
/                    Hoje          — hero: teto do dia. Lançamento rápido embutido.
/ciclo               Ciclo         — verba, composição, ritmo, projeção, extrato
/analise             Análise       — médias 3 ciclos, recorrências, ranking de corte
/patrimonio          Patrimônio    — curva, snapshots, meses de reserva
/fechar-ciclo        Fechamento    — wizard mensal
/config              Configuração  — renda, ciclo, meta, contas, fixos, provisões, categorias
/config/backup       Backup        — export/import JSON
```

### 7.1 `/` — Hoje (a tela que decide se o app é usado)

Hierarquia visual, do mais para o menos importante:

1. **`restaHojeCents`** — o número herói. Legível em 2 segundos, à distância, sem foco. Um único número dominando a tela.
2. Contexto de uma linha: `teto de hoje R$ X · gasto hoje R$ Y`.
3. **Lançamento rápido**: teclado numérico → chips de categoria (as 6 mais usadas, ordenadas por frequência real) → salvo. Máximo 3 toques. Sem tela de confirmação. Sem campo obrigatório além de valor e categoria. Undo por toast de 5 segundos.
4. Rodapé discreto: `resta no ciclo R$ Z · N dias`.

Estados de cor semântica: `restaHoje` positivo, próximo de zero, negativo, e modo recuperação. Cor é reforço, nunca a única indicação (acessibilidade).

O que **não** vai nesta tela: gráfico, lista de fixos, patrimônio, meta de poupança, mensagem motivacional, streak, badge.

### 7.2 `/fechar-ciclo` — Wizard de fechamento

Passos, na ordem: (1) confirmar renda realizada; (2) revisar transações sem categoria; (3) ver sobra ou déficit e destinar a sobra; (4) atualizar snapshot de patrimônio; (5) recalibrar meta do próximo ciclo — se sobrou com folga em 2 ciclos seguidos, **sugerir aumento** da meta de poupança com o valor calculado; (6) resumo: variação de patrimônio, taxa de poupança efetiva (`poupado / renda`), meses de reserva.

O passo 5 é o mecanismo de progresso do app. Sem ele, a meta fica congelada no valor inicial conservador para sempre.

---

## 8. Server Actions

```ts
// lib/actions/transacoes.ts
criarTransacao(input: TransacaoInput)
criarParcelamento(input: ParcelamentoInput)      // gera as N parcelas
editarTransacao(id, input)
excluirTransacao(id)
estornarTransacao(id, valorCents?, data?)

// lib/actions/ciclos.ts
garantirCicloAtual()                             // idempotente; chamada no layout
fecharCiclo(cicloId, input: FechamentoInput)
recalcularCicloAtual()                           // explícito, com aviso

// lib/actions/config.ts
atualizarConfig(input)
upsertCustoFixo / upsertProvisao / upsertConta / upsertCategoria

// lib/actions/patrimonio.ts
criarSnapshot(data, itens[])                     // pré-preenche com o snapshot anterior

// app/api/backup/route.ts
GET  → exporta JSON completo
POST → importa JSON (valida com Zod, exige confirmação, faz backup do db antes)
```

Toda action valida com Zod, revalida os paths afetados e retorna `{ ok: true, data }` ou `{ ok: false, erro }`. Sem exception vazando para a UI.

Export/import não é feature secundária: é a única garantia contra perda de dados num app local, e é o que faz o usuário confiar o suficiente para lançar tudo ali.

---

## 9. Testes obrigatórios

Vitest em `lib/finance/`. Casos que **precisam** ter teste:

- `limitesCiclo` com `diaRecebimento` 1, 15, 28, 31; virada de ano; fevereiro; ano bissexto.
- `verbaVariavel` com provisão zero e com provisão preenchida.
- `tetoHoje` no primeiro dia, no meio, no último dia do ciclo.
- `tetoHoje` depois de um gasto grande → confirmar que o teto dos dias seguintes cai e que a soma dos tetos restantes nunca ultrapassa o saldo.
- `saldoDisponivel` negativo → modo recuperação, sem teto negativo.
- Parcelamento: `999` em 3x → `333 + 333 + 333`; `1000` em 3x → `333 + 333 + 334`. A soma sempre bate.
- Estorno abatendo no dia da transação original.
- `TRANSFERENCIA` e pagamento de fatura não alterando `gastoRealizado`.
- Gasto de provisão anual não consumindo verba variável.
- Datas: lançamento às 23h no fuso `America/Bahia` cai no dia correto (regressão do bug UTC).

---

## 10. Ordem de implementação

**Fase 0 — Fundação.** Projeto, Prisma, migração, seed com categorias BR (Mercado, Delivery, Restaurante, Transporte, Combustível, Farmácia, Assinaturas, Lazer, Vestuário, Casa, Saúde, Educação, Presentes, Outros), utilitários de dinheiro (`formatBRL`, `parseBRL`, aritmética em centavos) e de data.

**Fase 1 — Motor de cálculo + testes. Sem UI nenhuma.** Todas as funções da seção 5, todos os testes da seção 9 passando. Não avance com teste vermelho. Se o motor estiver errado, todo o resto mostra números errados com confiança.

**Fase 2 — Configuração.** Renda, dia de recebimento, meta, contas, fixos, provisões, categorias. Sem isso não há ciclo.

**Fase 3 — Ciclo + lançamento + tela Hoje.** `garantirCicloAtual`, lançamento rápido, tela Hoje. **Fim da Fase 3 o app já é usável no dia a dia** — pare aqui e valide o fluxo diário antes de seguir.

**Fase 4 — Tela do ciclo.** Composição da verba, ritmo, projeção, extrato com filtros, edição e estorno.

**Fase 5 — Fechamento.** Wizard completo, destinação de sobra, recalibração de meta.

**Fase 6 — Análise.** Médias de 3 ciclos, detector de assinaturas, ranking por custo anualizado.

**Fase 7 — Patrimônio.** Snapshots, curva, meses de reserva.

**Fase 8 — Polimento.** Backup/restore, atalhos de teclado, estados vazios, responsividade, acessibilidade.

---

## 11. Direção de design (briefing, não receita)

O app é usado **todo dia, no celular, em 30 segundos, muitas vezes na fila do caixa**. Isso é o briefing.

Requisitos concretos:

- **Mobile-first de verdade.** Desktop é o caso secundário. Alvos de toque ≥ 44px. O teclado numérico não pode exigir precisão.
- **Números em tabular figures** (`font-variant-numeric: tabular-nums`) em toda tela com valores. Sem isso, os dígitos dançam e a leitura fica lenta.
- **Hierarquia brutal na tela Hoje.** Um número domina; todo o resto é secundário e visualmente mais quieto.
- **Sem gamificação.** Nada de streak, badge, confete, mensagem motivacional, emoji de parabéns. O reforço vem da curva de patrimônio subindo, que é real. Gamificação num app de dinheiro envelhece em uma semana e vira ruído.
- **Tom da interface, quando o usuário estoura o teto:** factual e orientado a ação, nunca julgador. "Você furou o orçamento" é errado. Mostre o número e as duas saídas possíveis.
- **Dark mode nativo** — o app é aberto à noite.
- Estados vazios são convite à ação, não decoração. Erros dizem o que aconteceu e como resolver.
- Labels pelo que o usuário controla, não pela implementação: "Quanto posso gastar hoje", não "Teto diário calculado".

Sobre estética: escolha uma direção com ponto de vista e justifique-a em uma linha no README. Evite os defaults reconhecíveis de UI gerada por IA — fundo creme com serifada de alto contraste e acento terracota; preto com um único verde ácido; layout tipo jornal com filetes e zero border-radius. Gaste ousadia em um lugar só: o tratamento do número herói. Todo o resto disciplinado e quieto.

---

## 12. Critérios de aceite

O app está pronto quando, em uso real:

1. Lançar um gasto na tela inicial leva **≤ 3 toques e ≤ 10 segundos**.
2. O teto do dia muda sozinho de um dia para o outro, sem nenhuma ação do usuário.
3. Um gasto grande hoje reduz o teto de amanhã, e a soma dos tetos dos dias restantes **nunca** ultrapassa o saldo disponível do ciclo.
4. Nenhuma tela apresenta como disponível dinheiro comprometido com fixos, provisão ou meta de poupança.
5. Registrar o pagamento da fatura do cartão não altera o gasto do ciclo.
6. Uma compra em 6x aparece nos 6 ciclos seguintes, e a soma das parcelas é exatamente o valor total.
7. Fechar o ciclo produz: sobra destinada, patrimônio atualizado e uma sugestão de meta para o próximo ciclo.
8. Um ciclo com renda menor que a prevista **não** produz teto negativo nem trava o app — entra em modo recuperação com saídas numéricas.
9. Export → banco apagado → import restaura o estado completo.
10. Um lançamento feito às 23h50 aparece no dia correto.
11. `pnpm test` verde. Zero erro de TypeScript. Zero `any`.

---

## 13. Não faça

- Não use `Float` ou `Number` decimal para dinheiro em nenhum ponto.
- Não use `DateTime` para datas civis, nem `new Date(string)` para comparar dias.
- Não recalcule a verba do ciclo atual a partir da config a cada render — ela é congelada.
- Não coloque regra de cálculo dentro de componente ou de server action; tudo em `lib/finance/`.
- Não misture custo fixo com verba variável em nenhum cálculo ou exibição.
- Não use `localStorage` como fonte de verdade (só para preferências de UI).
- Não adicione autenticação, multiusuário ou integração bancária na v1.
- Não bloqueie o lançamento de gasto por pendência de fechamento de ciclo.
- Não adicione gráfico na tela Hoje.
- Não gere dados fake/mock nas telas: se não há dado, mostre estado vazio com ação.
