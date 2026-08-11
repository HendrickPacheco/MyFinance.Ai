# TASKS-CUSTOS.md — CRUD visual de custos + Projeção dos próximos meses

**Criado em** 10/08/2026 · **Status** Proposto, aguardando execução
**Origem** Consolidação de dois estudos paralelos (arquitetura + UX/UI), reconciliados.

Duas features irmãs:

- **Feature A — CRUD visual de custos.** Criar, editar, desativar e excluir custos
  fixos, provisões anuais, compras parceladas e gastos variáveis, por tela, sem
  mexer no banco.
- **Feature B — Projeção dos próximos meses.** Ver, mês a mês, entrada prevista,
  fixos, parcelas, provisão, poupança-alvo e a verba que sobra — e **quando a
  verba respira**, porque uma parcela ou um custo fixo acabou.

---

## 0. O ponto de partida (verificado no código, não suposto)

### 0.1 O motor de projeção já existe e está verde

`src/domain/finance/projecao.ts::projetarCiclos(EntradaProjecao): CicloProjetado[]`
já entrega, **por ciclo**: `rendaPrevistaCents`, `poupancaAlvoCents`, `fixosCents`,
`provisaoMensalCents`, `verbaVariavelCents`, `parcelasComprometidasCents`,
`verbaLivreCents`, `verbaDiariaLivreCents`, `rolloverRecebidoCents`, `abaixoDoPiso`.

É função pura, respeita a verba congelada (ciclo 1 vem de `CicloCongelado` e é
emitido tal e qual) e trata parcela como consumidora do teto, nunca deduzida da
verba (D-11). `projetarComCenario` já simula uma compra hipotética.

O read-model `src/application/projecao.ts::obterProjecao` é **read-only de
propósito** (não chama `garantirCicloAtual`).

**Hoje isso é consumido só por `src/application/ia/ferramentas/projecao.ts`.**
A Feature B é, majoritariamente, superfície de UI sobre um motor que já existe.

### 0.2 O que falta, por tipo de custo

| Tipo | Já existe | Falta |
|---|---|---|
| Variáveis | CRUD completo em `src/application/transacoes.ts` (`criar/editar/excluir/estornar`) com guarda `CicloFechadoError` | Só a **tela** de gestão multi-ciclo |
| Fixos | `listarAtivos` + `salvar`; form em `/config` | **Excluir**, **desativar** pela UI, `obter`, `listarTodos`, vigência |
| Provisões | `listarAtivas` + `salvar` + `ajustarAcumulado` | **Excluir**, `obter`, `listarTodas` |
| **Parcelados** | Só `criar` e `listarPorIds` | **Tudo**: listar, obter, atualizar, encerrar. Sem lar na UI |

### 0.3 O schema já impede o caminho perigoso

Verificado em `prisma/schema.prisma`: nem `PagamentoFixo.custoFixoId` nem
`Transacao.parcelamentoId` declaram `onDelete`, então o Postgres aplica
**`Restrict`**. Apagar um custo fixo com pagamento registrado, ou um
parcelamento com parcelas, **falha no banco hoje**.

Consequência de design: o delete tem que ser decidido no caso de uso, nunca
delegado a cascade. E a exclusão total de um parcelamento com parcelas pagas
exigiria migração adicional — está **fora do escopo** (§0.4).

### 0.4 Decisões tomadas pelo dono (10/08/2026)

1. **Excluir parcelamento = cancelar só as parcelas futuras.** Apaga as parcelas
   a vencer que não estão em ciclo fechado, preserva as pagas, carimba
   `encerradoEm`. **A opção "excluir a compra inteira, inclusive as pagas" não
   entra nesta leva** — apagaria gastos de ciclos já fechados e obrigaria a
   recalcular a sobra deles. Se o botão não existe, ninguém o aperta por engano.
2. **Vigência de custo fixo entra** (`vigenteDe`/`vigenteAte`, nullable). É o que
   permite a projeção mostrar a verba respirando também quando um custo fixo
   acaba, não só quando uma parcela termina.

### 0.5 Estado do design system

Só existe **um** arquivo de primitivas: `src/components/ui/index.tsx` — `Button`,
`Card`, `Input`, `Select`, `Checkbox`, `Label`, `Badge`, `ConfirmInline`, `Modal`,
`TooltipPortal`, `EmptyState`.

Não existe `Table`, `Tabs`, `Segmented` nem `ConfirmDialog`. **Essas quatro
primitivas são o grosso do custo da Feature A** e vêm antes de qualquer tela.

`ContentHeader` (`src/components/layout/content-header.tsx`) está pronto e órfão —
zero usos. As telas novas o estreiam.

Breakpoint único do chassi: `lg` (1024px). Container de página:
`mx-auto w-full space-y-6 lg:max-w-3xl`.

---

## 1. Regras que este plano não pode violar

Além das regras invioláveis do `CLAUDE.md` (centavos `Int` com sufixo `Cents`;
data civil `String` "YYYY-MM-DD"; cálculo só em `src/domain/finance/`; `donoId`
em tudo; nunca `findUnique({ where: { id } })`):

- **R1 — Passado é congelado.** Editar ou excluir um `CustoFixo` **nunca** altera
  ciclo fechado, porque cada `Ciclo` guarda `fixosCents`/`provisaoMensalCents`/
  `verbaVariavelCents` congelados. Isso já é verdade; nenhuma tarefa pode quebrar.
- **R2 — Retroatividade passa pela guarda.** Todo caso de uso novo que apaga ou
  edita `Transacao` **reusa** `exigirConfirmacaoSeRetroativo` +
  `recalcularSobraDosCiclosFechados` de `src/application/transacoes.ts`. Editar
  ciclo fechado por fora dessa guarda corrompe `sobraCents` **sem erro nenhum** —
  é o maior risco das duas features.
- **R3 — Parcela nunca é contada duas vezes.** Parcela é `Transacao` VARIAVEL que
  consome o teto. Nada neste plano pode subtraí-la dentro de `verbaVariavelCents`.
- **R4 — Nada comprometido aparece como disponível.** Nenhuma tela mistura fixo,
  provisão ou parcela com verba variável na exibição.
- **R5 — A projeção é simulação, não ciclo.** Nunca grava `Ciclo`, nunca chama
  `garantirCicloAtual`. Ciclos ≥ 2 são hipotéticos e rotulados como tal via
  `premissas`.
- **R6 — Migração aditiva e nullable.** Todo campo novo tem default = comportamento
  atual, para a suíte Vitest existente continuar verde sem ser editada.

---

## 2. Arquitetura das mudanças

### 2.1 Migração (aditiva, nullable)

```prisma
model CustoFixo {
  // ...
  vigenteDe  String?  // YYYY-MM-DD — null = sempre valeu (comportamento atual)
  vigenteAte String?  // YYYY-MM-DD — null = sem término previsto
}

model Parcelamento {
  // ...
  encerradoEm String?  // YYYY-MM-DD — cancelamento antecipado. null = ativo
}
```

`vigenteDe`/`vigenteAte` são **hints de projeção futura**, não vigência histórica
retroativa: ciclos já nascidos os ignoram (são congelados). Sem `vigenteAte`, o
custo é constante — idêntico a hoje.

Nenhum índice novo (volumes de dezenas de linhas por dono; `donoId` já indexado).
Nenhuma unicidade de nome — o dono pode ter dois "Cartão X"; duplicata vira **aviso
na UI**, não constraint que o bloqueia.

### 2.2 Portas novas (`src/domain/ports/repositorios.ts`)

```ts
interface CustoFixoRepository {
  listarAtivos(): Promise<CustoFixo[]>;            // existe
  salvar(custo: CustoFixo): Promise<CustoFixo>;    // existe
  listarTodos(): Promise<CustoFixo[]>;             // NOVO — inclui inativos
  obter(id: string): Promise<CustoFixo | null>;    // NOVO
  excluir(id: string): Promise<void>;              // NOVO
}

interface ProvisaoRepository {
  listarTodas(): Promise<ProvisaoAnual[]>;         // NOVO
  obter(id: string): Promise<ProvisaoAnual | null>;// NOVO
  excluir(id: string): Promise<void>;              // NOVO
}

interface ParcelamentoRepository {
  listar(): Promise<Parcelamento[]>;                                    // NOVO
  obter(id: string): Promise<Parcelamento | null>;                      // NOVO
  atualizar(id: string, patch: Partial<Parcelamento>): Promise<Parcelamento>; // NOVO
}

interface TransacaoRepository {
  listarPorParcelamento(parcelamentoId: string): Promise<Transacao[]>;  // NOVO
}
```

Adapters: `obter` usa `findFirst({ where: { id, donoId } })`; `excluir` e
`atualizar` usam `deleteMany`/`updateMany` com `{ id, donoId }`. **Nunca
`findUnique` por id.**

### 2.3 Casos de uso novos

`src/application/custos.ts` (novo):
```ts
listarCustosFixos(deps): Promise<CustoFixo[]>          // listarTodos, ativos e inativos
desativarCustoFixo(deps, id): Promise<void>
excluirCustoFixo(deps, id): Promise<void>              // recusa se houver PagamentoFixo
listarProvisoes(deps): Promise<ProvisaoAnual[]>
excluirProvisao(deps, id): Promise<void>               // recusa se acumuladoCents != 0
```

`src/application/parcelamentos.ts` (novo):
```ts
listarParcelamentos(deps): Promise<ParcelamentoResumo[]>
// resumo = parcelamento + terminaEm (addMeses(dataCompra, numParcelas-1))
//        + parcelasPagas/total + valorRestanteCents + parcelasEmCicloFechado

encerrarParcelamento(deps, id, confirmarRetroativo?): Promise<ResultadoRetroativo>
// exigirEscrita; apaga só parcelas futuras NÃO em ciclo fechado; preserva pagas;
// carimba encerradoEm; guarda R2

editarParcelamento(deps, id, patch, confirmarRetroativo?): Promise<ResultadoRetroativo>
// descricao/categoria/metodo: sempre livres
// valorTotalCents: só quando parcelasPagas === 0; rateia via ratearCents
```

Todos abrem com `exigirOwner`/`exigirEscrita`, no padrão de `transacoes.ts`.

### 2.4 Enriquecimento da projeção

**(a) Custo fixo com vigência — motor.** Hoje `EntradaProjecao.fixosCents` é um
escalar aplicado a todos os ciclos futuros. Função pura nova:

```ts
// src/domain/finance/verba.ts
export function fixosVigentesNoCicloCents(
  custos: readonly { valorCents: number; vigenteDe: DataCivil | null; vigenteAte: DataCivil | null }[],
  limites: LimitesCiclo,
): number
```

`projetarCiclos` aceita `custosComVigencia?` **opcional**; quando presente calcula
`fixosCents` por ciclo, quando ausente cai no escalar atual. Compatibilidade
preserva a suíte verde e os consumidores de IA (R6). `CicloCongelado` nunca é
recomputado — vigência só afeta ciclos ≥ 2.

**(b) Detalhe por ciclo — saída do motor.** `ObrigacaoFutura` já carrega
`parcelamentoId`, mas hoje só entra na *entrada*; a saída expõe apenas o total
`parcelasComprometidasCents`. Sem detalhe não há como marcar o fim de parcela.
`CicloProjetado` ganha:

```ts
obrigacoesDoCiclo:  { parcelamentoId: string | null; descricao: string;
                      valorCents: number; parcelaNum: number; numParcelas: number }[];
terminamNesteCiclo: { parcelamentoId: string; descricao: string; valorMensalCents: number }[];
```

`descricao`/`parcelaNum` não existem em `ObrigacaoFutura` — o campo é estendido na
entrada, ou enriquecido no read-model a partir de `listarParcelamentos()`. Decidir
na Fase 6; a segunda opção mantém o motor mais magro.

Também falta `periodoLabel` (`ago/26`) para o eixo X — formatação nova em
`src/shared/data.ts`, junto com a consolidação de `formatarDataCurta` (§5).

---

## 3. Telas e rotas

### 3.1 Feature A — uma seção, três sub-rotas reais, apresentadas como abas

```
/custos                  → redirect para /custos/fixos
/custos/fixos            Custos fixos + provisões anuais
/custos/parcelados       Compras parceladas (agrupadas por COMPRA, não por parcela)
/custos/variaveis        Gastos variáveis, multi-ciclo, com filtros
  layout.tsx compartilhado: ContentHeader + BarraTotais + Tabs
```

**Por que sub-rota real e não aba em `useState`:** o app é 100% Server Components
com `revalidatePath` nas actions. Aba em estado de cliente quebra deep-link e botão
voltar, e obriga a carregar os três datasets sempre.

**Por que abas irmãs e não três itens de sidebar:** o dono precisa **comparar** —
"quanto do meu mês é fixo vs. parcela vs. livre". Uma **barra de totais persistente
acima das abas** materializa a comparação; três rotas soltas a destroem.

Sidebar ganha um item na posição 3, entre Ciclo e Patrimônio:
`{ href: '/custos', label: 'Custos', icon: Receipt }`.

**Reconciliação obrigatória com o que já existe** — senão viram dois CRUDs do
mesmo dado, que é fábrica de bug:

- `ListaCustos` e `ListaProvisoes` saem de `src/components/config/gerenciadores.tsx`
  → viram `/custos/fixos`. `/config` ganha uma link-linha no padrão do card de
  Backup: `Custos fixos e provisões → Cadastrar, editar e desativar`.
- `ExtratoVariaveis` é **extraído** com prop `escopo: 'ciclo' | 'periodo'`.
  `/ciclo` segue mostrando o extrato do ciclo; `/custos/variaveis` é o mesmo
  componente com filtros de período. **Zero duplicação de markup.**
- `ParcelamentoModal` é reaproveitado, acrescido do bloco de prévia (§3.3).

### 3.2 `/custos/parcelados` — o objeto é a compra, não a parcela

Mudança conceitual mais importante da Feature A. Hoje `parcelados-lista.tsx`
mostra *uma linha por parcela do ciclo*. Para **gerenciar**, o objeto é a compra:

```
COMPRA ▲            CATEGORIA   PARCELA   VALOR/MÊS   RESTA       TERMINA   AÇÕES
Notebook             Casa         7/12     291,58     1.457,90    02/2027   ✎ ⋯
03/2026 · R$ 3.499,00           ▓▓▓▓▓▓▓░░░░░
Passagem Recife      Lazer       11/12     183,25       183,25    09/2026   ✎ ⋯
10/2025 · R$ 2.199,00           ▓▓▓▓▓▓▓▓▓▓▓░  ⬆ acaba no próximo mês
```

Colunas em ordem de importância para a decisão do dono:
1. **VALOR/MÊS** — é o que consome o teto diário. Só ele em `text-fg font-medium`.
2. **TERMINA** — quando a verba respira. Ponte direta para a Feature B.
3. **RESTA** — o compromisso futuro ainda não pago.
4. **PARCELA k/N** + barra de progresso 4px.

Valor total e data da compra descem para a segunda linha em `text-xs text-faint` —
são contexto histórico, não decisão. Ordenação default: `terminaEm` crescente.
Expandir a linha revela o cronograma de parcelas, com `PagamentoToggle` existente.

### 3.3 Formulários — decisão por tipo

| Tipo | Forma | Por quê |
|---|---|---|
| Custo fixo / Provisão | Form compartilhado **abaixo da lista** (padrão de `gerenciadores.tsx`), rótulo `Editando: {nome}` | 4 campos, cadastro em lote é comum. Modal só adiciona cliques |
| Parcelamento (criar/editar) | **Modal** (`ParcelamentoModal`) | Campos compostos, prévia calculada, e é a única criação irreversível em cascata |
| Variável | `LancamentoPainel` + edição inline existentes | Não tocar — é o fluxo de 3 toques da SPEC |

**Prévia no modal de parcelamento** (aparece só com valor > 0 e parcelas ≥ 2):

```
┌ PRÉVIA ──────────────────────────────────────────────┐
│  12× de R$ 291,58                                     │
│  1ª em 08/2026 · última em 07/2027                    │
│  A última parcela é R$ 291,62 (ajuste de centavos).   │
│  ──────────────────────────────────────────────────   │
│  ⚠ Sua verba livre cai de R$ 3.005 para R$ 2.714/mês │
│    até 07/2027.        [ Ver na projeção → ]          │
└───────────────────────────────────────────────────────┘
```

Dizer o resto de centavos explicitamente importa: a regra `floor` com resto na
última parcela é invisível e assusta quando descoberta depois. O aviso de impacto
usa `projetarComCenario`, **que já existe** — é a ponte entre A e B, e é a peça
que muda comportamento: o dono vê o custo futuro *antes* de assumir a parcela.

### 3.4 Feature B — `/projecao`

```
Horizonte: [ 6 meses │▪12 meses▪│ 24 meses ]      [ ⛭ Simular compra… ]

┌ MANCHETE ───────────────────────────────────────────────────────────┐
│ A verba livre passa de R$ 3.005 para R$ 3.463 em fev/2027, quando as │
│ 3 últimas parcelas acabam.                                           │
│ VERBA LIVRE MÍN.   VERBA LIVRE MÁX.   MESES ABAIXO DO PISO          │
│ R$ 2.714 (out/26)  R$ 3.463 (fev/27)  0 de 12                       │
└──────────────────────────────────────────────────────────────────────┘

┌ COMPOSIÇÃO DA RENDA, MÊS A MÊS ────────────────────────── (desktop) ┐
│ Coluna empilhada. De baixo para cima:                                │
│   fixos · provisão · poupança-alvo · parcelas · VERBA LIVRE (topo)   │
│                              ⬆ +458 no tick de fev/27                │
│ ■ Custos fixos ■ Provisão ■ Poupança-alvo ■ Parcelas ■ Verba livre   │
└──────────────────────────────────────────────────────────────────────┘

┌ MÊS A MÊS ───────────────────────────── [ ⤓ Exportar CSV ] ─────────┐
│ MÊS     RENDA    FIXOS   PROVIS.  POUP.   PARCELAS  VERBA LIVRE  Δ  │
│ out/26  30.000   4.884    317    18.000    4.211     2.588    +183  │
│         ⬆ Passagem Recife acaba · +R$ 183,25/mês                     │
└──────────────────────────────────────────────────────────────────────┘

Premissas: renda constante · sobra zero nos próximos ciclos · custos fixos
e provisões atuais mantidos · nenhum parcelamento novo.
```

**Por que coluna empilhada com a verba no topo.** O que o dono decide, em ordem:
(1) "posso assumir esta parcela?" → precisa da verba livre mês a mês; (2) "quando
sobra mais?" → precisa ver o degrau; (3) "por que este mês está apertado?" →
composição sob demanda. O topo da pilha é a renda prevista, quase plana, então o
teto do gráfico não dança e a altura do segmento superior lê-se direto como
"quanto sobra". O segmento do topo é o único cuja variação o olho acompanha numa
pilha — colocar a verba lá é a diferença entre um gráfico que responde e um que
decora. Parcelas fica **colada** na verba: quando o laranja encolhe, o azul cresce
na mesma fronteira, e o respiro vira um movimento único.

Descartados: linha da verba (perde a composição, exige segunda figura); barras
agrupadas (5 séries × 24 meses = 120 barras, ilegível); eixo duplo (proibido).

**A tabela não é opcional** — é o *table-view twin* do gráfico e é ela que o dono
usa para conferir número contra a planilha que está substituindo. O bloco
**Premissas** vem de `ResultadoProjecao.premissas` (já existe): projeção sem
premissas visíveis é promessa.

**Paleta** — validada com o script do dataviz contra a surface `#14171f`, seis
checks PASS (pior par adjacente ΔE 8.4 em protanopia, 19.8 em visão normal,
contraste ≥ 3:1). Todas de `PALETA_CATEGORICA` já existente:

| Segmento | Hex | Slot |
|---|---|---|
| Custos fixos | `#9085e9` | violeta [6] |
| Provisão | `#c98500` | amarelo [3] |
| Poupança-alvo | `#199e70` | aqua [2] |
| Parcelas | `#d95926` | laranja [1] |
| **Verba livre** | `#3987e5` | azul [0] |

Não usar `--color-accent` `#6ea8fe` como série — reprova a banda de luminosidade
no modo escuro (L 0.729 vs. teto 0.67). Ele segue como cor de interação.
**Zero token novo em `globals.css`** — só um mapa `CORES_PROJECAO` em
`src/components/dashboard/cores.ts`, por identidade de série, nunca por ordem de
renderização.

**Marcar o fim de parcela — três reforços redundantes, nunca cor sozinha:**
marcador `⬆ +R$ 458` sob o tick do eixo em `--color-positivo`; badge na linha da
tabela (`Notebook acaba · +R$ 291,58/mês`); e a manchete em texto, para quem não
lê figura. Sem respiro no horizonte: *"Nenhum parcelamento acaba nos próximos 12
meses. Aumente para 24 meses para ver o primeiro."*

**Mobile.** Coluna empilhada de 12–24 séries a 375px é ilegível. No mobile a
tabela-calendário vira a visualização principal, com micro-barra de composição de
6px por linha — **mesmo encoding, mesmas cores, mesma ordem**, para o usuário
aprender a leitura uma vez só. Recharts não é carregado (`hidden lg:block`), o que
tira ~100kb do caso de uso "fila do caixa".

Horizonte 6/12/24 mora na **URL** (`?horizonte=12`), não em `useState` — é Server
Component e o dono compartilha o link. `localStorage` como preferência de UI é
permitido (regra 6).

Nada disso viola "sem gráfico na tela Hoje": `/projecao` é rota própria.

---

## 4. Exclusão destrutiva e efeito retroativo

O erro a evitar: um `ConfirmInline` genérico "Tem certeza?" em cima de um
parcelamento com 7 parcelas pagas. **A consequência precisa ser contada em
números, não adjetivada.**

### 4.1 Custo fixo / Provisão — desativar é o default

Menu ⋯: `✎ Editar` · `⏸ Desativar` (primária, reversível) · `🗑 Excluir
definitivamente` (`text-negativo`).

**Desativar** → `ConfirmInline tone="neutral"`:
> **Desativar "Academia"?**
> Ele para de entrar no cálculo da verba a partir do próximo ciclo (01/09) e some
> desta lista. Os ciclos já fechados continuam com o valor que tinham. Dá para
> reativar quando quiser.

**Excluir** — corrigido em 10/08/2026 após auditoria. A versão original deste
plano prometia um botão `[ Excluir para sempre ]` que funcionaria "apesar dos 7
ciclos fechados". **Esse botão é impossível**: a FK `PagamentoFixo.custoFixoId`
é `Restrict`, então ele falharia 100% das vezes. Prometer na UI uma ação que o
banco recusa é pior que não oferecê-la. O comportamento correto é bifurcado:

*Com pagamento registrado* → não há botão de excluir. `ConfirmDialog` com uma
saída só:
> **"Academia" não pode ser excluída.**
> Ela está marcada como paga em **7 ciclos**, e apagar o cadastro deixaria esses
> pagamentos órfãos. Desative para que ela pare de entrar no cálculo da verba —
> o histórico continua intacto.
> `[ Cancelar ]` `[ Desativar ]`

*Sem nenhum pagamento* → `ConfirmInline` simples:
> **Excluir "Academia"?**
> Ela nunca foi usada em nenhum ciclo. Excluir não afeta histórico nenhum.

A alternativa seria migrar `PagamentoFixo.custoFixoId` para `onDelete: SetNull`,
o que é escopo novo e não foi escolhido.

Provisão com `acumuladoCents > 0` é **bloqueada**: apagar joga fora dinheiro já
reservado.

### 4.2 Parcelamento — números antes das opções

```
┌ ⚠  Cancelar as parcelas futuras de "Notebook Dell"? ──────────┐
│ 12 parcelas de R$ 291,58 · compra em 03/2026                  │
│                                                               │
│   ● 7 parcelas já pagas         R$ 2.041,06   (03–09/2026)    │
│   ○ 5 parcelas a vencer         R$ 1.457,90   (10/2026–02/27) │
│                                                               │
│ As 5 futuras somem. O que você já pagou continua no histórico │
│ e nos ciclos fechados. Sua verba livre sobe R$ 291,58/mês a   │
│ partir de 10/2026.                                            │
│                                                               │
│                    [ Cancelar ]  [ Cancelar 5 futuras ]       │
└───────────────────────────────────────────────────────────────┘
```

- Contagens vêm do **servidor** (`ResultadoRetroativo.ciclosAfetados` +
  `parcelasPagas`), nunca estimadas no cliente.
- O rótulo do botão diz **o que vai acontecer** (`Cancelar 5 futuras`), nunca
  "Confirmar".
- **Sem undo por toast.** Prometer undo aqui seria desonesto.
- Foco inicial em `Cancelar`, **nunca** no botão destrutivo.

Se alguma parcela futura cair em ciclo fechado, encadeia o `TITULO_RETROATIVO`
existente e exige o segundo passo de confirmação (R2).

### 4.3 Efeito retroativo — três camadas proporcionais ao dano

**0. A mensagem precisa ser bifurcada** (corrigido em 10/08/2026 após auditoria).
`desativar`/`excluir`/`upsert` de custo fixo chamam `recalcularCicloAtualSeVazio`,
que **recalcula o ciclo corrente quando ele ainda não tem nenhuma transação** —
justamente o dia 1 do ciclo, quando o dono mais provavelmente está arrumando os
custos. Dizer "vale a partir do próximo ciclo" ali seria mentira: a verba de hoje
muda na hora. A action precisa devolver se houve recálculo, e a UI escolhe:

- *sem recálculo* → `Vale a partir de 01/09 — o ciclo atual continua em R$ 3.005,46.`
- *com recálculo* → `O ciclo atual ainda não tem gasto lançado, então a verba de agosto passou de R$ 3.005,46 para R$ 2.816,46.`

**1. Banner persistente no topo de `/custos/fixos`** (não é toast, não some):
> ⓘ Mudanças em custos fixos e provisões valem a partir do próximo ciclo (01/09).
> A verba do ciclo atual (01/08 – 31/08) está congelada em R$ 3.005,46.
> `[ Recalcular ciclo atual ]`

Visual `bg-surface-2` + ícone `Info` em `text-accent`. **Não usar `text-atencao`** —
isto é regra do produto, não problema; amarelo diário vira ruído e o dono para de
ler os avisos que importam.

**2. Confirmação de salvamento**, sempre com **as duas datas concretas**:
> `Custo fixo salvo. Vale a partir de 01/09 — o ciclo atual continua em R$ 3.005,46.`

**3. `ConfirmInline` de recálculo** (o botão do banner, que quebra o congelamento),
mostrando **o valor de antes e o de depois** — é o que transforma "recalcular" de
ação abstrata em decisão informada:
> A verba de 01/08 – 31/08 passa de R$ 3.005,46 para R$ 2.816,46 e o seu teto de
> hoje muda na mesma hora. Os gastos já lançados não mudam.

`RecalcularCicloButton` já existe; o delta é o que falta nele.

**Editar parcelamento** nunca altera parcelas pagas. `Valor total`, `Nº de parcelas`
e `Data da compra` ficam **desabilitados** quando `parcelasPagas > 0`, com hint sob
o campo: *"Já há 7 parcelas pagas — trocar o valor reescreveria ciclos fechados.
Para mudar, cancele as futuras e crie outra compra."* Campo desabilitado com
explicação > campo habilitado que falha no submit.

---

## 5. Componentes

### Primitivas novas em `src/components/ui/index.tsx`

| Componente | Spec |
|---|---|
| **`Tabs`** | `role="tablist"`, setas ←→, Home/End. Renderiza `<Link>` (sub-rotas reais). Ativo: `bg-surface-2 text-accent font-medium` + underline 2px. `min-h-[44px]`. Substitui o `tabCls()` ad-hoc de `config-geral.tsx` |
| **`Segmented`** | `role="radiogroup"` + `aria-checked`. Horizonte 6/12/24 |
| **`Table` / `Th` / `Td` / `SortableTh`** | `<table>` semântica. `SortableTh` com `aria-sort` + `<button>` interno. `Td numeric` aplica `text-right tnum`. Linha `py-3` (48px) |
| **`ConfirmDialog`** | `Modal` + `role="alertdialog"` + `aria-describedby` **na consequência**. Props: `titulo`, `consequencia: ReactNode`, `confirmLabel` dinâmico, `tone`. Foco nunca no botão destrutivo |

Bônus barato: extrair o `Toast` hoje duplicado em `lancamento-rapido.tsx` e
`lancamento-painel.tsx` para `ui/`, com `role="status" aria-live="polite"`.

**Sobre `<table>` semântica:** diverge do `grid-cols-[…]` de `extrato-variaveis.tsx`,
de propósito. As listas novas ganham **ordenação por coluna**, e `aria-sort` só
existe em `<th>`; e o leitor de tela anuncia "Notebook, coluna Valor por mês,
R$ 291,58" em vez de despejar 7 spans órfãos. O grid do extrato fica como está —
não tem ordenação, e mexer nele é risco sem retorno.

### Feature

`src/components/custos/`: `custos-tabs` · `barra-totais` · `aviso-ciclo-congelado` ·
`fixos-tabela` · `fixos-lista-mobile` · `fixo-form` · `provisoes-tabela` ·
`parcelados-tabela` · `parcelamento-linha-expansivel` · `parcelamento-preview` ·
`encerrar-parcelamento-dialog` · `excluir-fixo-dialog` · `custos-filtros`

`src/components/projecao/`: `projecao-kpis` · `projecao-filtros` ·
`projecao-stack-chart` (`hidden lg:block`) · `projecao-tooltip` · `projecao-tabela` ·
`projecao-lista-mobile` · `mes-detalhe-painel` · `marcador-fim-parcela` · `premissas`

### Reaproveitados sem tocar

`Button` (a variante `danger` finalmente ganha uso real) · `Card`/`CardHeader`/
`CardContent` · `Input`/`Select`/`Label`/`Checkbox` · `Badge` · `Modal` ·
`ConfirmInline` · `EmptyState` · `TooltipPortal` · `ContentHeader` (estreia) ·
`PagamentoToggle` · `LancamentoPainel` · `ParcelamentoModal` ·
`atribuirCoresCategoricas`/`PALETA_CATEGORICA` · `formatBRL`/`parseBRL`/`ratearCents` ·
`formatarReaisCompacto` · `.tnum`

### Débito que esta feature paga antes de criar tela

1. **`ExtratoVariaveis` extraído com prop `escopo`** — pré-condição, não
   nice-to-have. Já existem duas superfícies de gasto variável (`/ciclo` e o painel
   desktop); sem a extração, `/custos/variaveis` vira a terceira cópia do markup.
2. O **formulário de edição de transação** está duplicado inteiro entre
   `transacao-linha.tsx` e `extrato-variaveis.tsx` → extrair antes.
3. `formatarDataCurta` duplicada em 4 arquivos → `src/shared/data.ts`.
4. Dois padrões incompatíveis de campo monetário (texto livre + `parseBRL` vs.
   acumulador de centavos) → todo campo novo desta feature usa o **acumulador**,
   sem exceção.

---

## 5.1 Andamento

| Fase | Status |
|---|---|
| 2 — Migração aditiva | ✅ 10/08/2026 |
| 1 — Portas e repositórios | ✅ 10/08/2026 |
| 3 — Primitivas de UI | ✅ 10/08/2026 |
| 4 — Casos de uso de custos e provisões | ✅ 10/08/2026, auditada e corrigida |
| 5 — Casos de uso de parcelamento | ✅ 10/08/2026, auditada e corrigida |
| 6 — Domínio da projeção | ✅ 10/08/2026 |
| 7 — Chassi `/custos` + `/custos/fixos` | ✅ 10/08/2026 |
| 8 — `/custos/parcelados` | ✅ 10/08/2026 |
| 9 — `/custos/variaveis` | ✅ 10/08/2026 |
| 10 em diante | pendente |

Portões em 10/08/2026: `tsc` limpo · **863 testes** verdes · `next build` verde ·
`verificar:isolamento` OK com 20 checagens (3 novas na Fase 7 para o `groupBy`
de `PagamentoFixo` — `groupBy` é query do Prisma Client e **não** herda escopo,
então o `donoId` no `where` é obrigatório — e 4 novas na Fase 8 para o
`aplicarLote` transacional; não rerodado na Fase 9, que não tocou em query).

### Achado da revisão no navegador — Fase 9 (10/08/2026)

**O extrato estourava a largura da página no mobile.** `CLASSES_GRID` tem cinco
colunas de largura FIXA (30,5rem + gaps) e só cabe a partir de ~38rem. Isso
nunca tinha aparecido porque a home monta o extrato dentro de um
`hidden lg:block` — ele **nunca renderizava abaixo de 1024px**. `/custos/variaveis`
o renderiza em qualquer largura, e a seção está a **um toque** na barra inferior
do celular desde a correção da Fase 7. Resultado: o BODY da página ganhava
scroll lateral e a coluna de valor ficava cortada fora da tela.

Corrigido prendendo o scroll horizontal num contêiner próprio
(`overflow-x-auto` + `min-w-[38rem]`), sem tocar no grid — o §5 avisa que mexer
nele é risco sem retorno.

**Lição que vale para a Fase 10:** componente extraído de um contexto
`hidden lg:block` chega sem nenhuma garantia de responsividade, porque ela nunca
foi exercitada. Todo componente movido para uma rota nova precisa ser aberto
abaixo de 1024px antes de ser dado por pronto.

Verificado na mesma passagem, sem regressão: `/ciclo` lista as transações com
menu ⋯ (Editar/Estornar/Excluir) e o formulário de edição **extraído** abre com
valor, data, categoria e descrição corretamente pré-preenchidos; a home
(mobile) mantém o teclado de lançamento; console limpo nas três rotas, sem
hydration mismatch.

### Decisões e achados da Fase 9

- **Eram TRÊS superfícies de gasto variável, não duas** — e as duas que já
  existiam são componentes DIFERENTES, não uma cópia da outra:
  `ciclo/transacao-linha.tsx` (extrato do ciclo: lista RENDA/TRANSFERENCIA
  também, tem menu ⋯ e **estorno**, layout `flex`) e o `LinhaExtratoVariavel`
  interno de `dashboard/extrato-variaveis.tsx` (só gasto variável, dois botões
  de ícone, sem estorno, selos "programado"/"estorno", layout `grid`).
- **O que foi unificado** (`src/components/transacoes/`): o **formulário de
  edição inline** (`transacao-edicao-form.tsx`), o **fluxo de exclusão** com os
  dois passos de confirmação (`use-exclusao-transacao.tsx`) e o **texto do
  aviso retroativo** (`retroatividade.ts`, com teste). Os três estavam
  duplicados verbatim.
- **O que NÃO foi unificado, de propósito:** a linha em si. As duas divergem em
  comportamento (estorno existe numa e não na outra; a do ciclo mostra tipo com
  sinal/cor, a de variáveis mostra selos e método), não só em markup. Uma linha
  única precisaria de `mostrarEstorno?`, `mostrarSelos?`, `variante`… — a
  abstração que serve mal às três. `TransacaoLinha` encolheu de 385 para ~195
  linhas mesmo assim.
- **`ExtratoVariaveis` mudou de casa** — saiu de `components/dashboard/` para
  `components/transacoes/`, porque deixou de ser do painel. `escopo` muda só a
  COPY (título, rótulo do total, estado vazio); o que é listado continua sendo
  decidido por `extratoTransacoesVariaveis` no servidor.
- **O total do recorte é somado no SERVIDOR, sobre as mesmas linhas filtradas.**
  Por isso o filtro inteiro (período, categoria, método) vive na URL, e não só
  o período: filtrar no cliente e somar no servidor é como um total passa a
  discordar da lista logo acima dele. Funções puras novas em `agregacoes.ts`:
  `somarRealizadosCents` (espelho de `somarProgramadosCents`) e
  `filtrarLinhasVariaveis`.
- **R4 sai de graça, e é o ponto:** a lista reusa `extratoTransacoesVariaveis`,
  que aplica `contaComoVerbaVariavel` — parcela e gasto de provisão nunca
  entram. Não há regra de R4 escrita na tela; há uma nota de rodapé dizendo ao
  dono que eles ficaram de fora e por quê.
- **`parsearFiltroVariaveis` nunca lança.** URL com `de=ontem` cai no padrão em
  vez de dar 500 — a tela é de leitura, e um parâmetro torto não é motivo para
  o dono perder acesso ao próprio extrato. `de > ate` é invertido, não
  descartado.
- **`revalidarTudo` de `actions/transacoes.ts` ganhou
  `revalidatePath('/custos', 'layout')`** — sem o `'layout'` a barra de totais
  fica velha (Fase 7). Como `layout` cobre as três abas, nenhuma sub-rota
  precisa ser listada.
- **Limitação assumida:** não há teste de renderização. `vitest.config.ts` usa
  `environment: 'node'` e `include: ['src/**/*.test.ts']` — não há jsdom nem
  testing-library no repo. A regressão da extração foi coberta empurrando o que
  dá para `.ts` sem JSX (o texto retroativo, o parser de filtro, as somas e o
  filtro), no mesmo padrão de `ordenacao-parcelados.ts` da Fase 8. O
  comportamento de `/ciclo` e da home continua provado só por revisão e pelo
  navegador.

### Achados da revisão no navegador — Fase 8 (10/08/2026)

1. **Barra de progresso desenhava outra coisa que o rótulo.** A coluna PARCELA
   mostrava `parcelaCorrente` (1/2) e a barra logo abaixo desenhava
   `parcelasPagas` (0/2). Como `pagoEm` é marcação manual do `PagamentoToggle`
   e o dono quase nunca marca, a barra ficava **sempre vazia** debaixo de um
   "1/2" — lê-se como erro do número, não como "nada foi marcado". A barra
   passou a usar o mesmo numerador do rótulo, que é o que o mock do §3.2 mostra
   (`7/12` → 7 blocos preenchidos).
2. **`acabaNoProximoCiclo` nunca dispara nos dados reais — e o código está
   certo.** Causa raiz: a `Config` tem `diaRecebimento = 6`, mas o ciclo atual
   nasceu com dia 1 (01/08–31/08). Logo `proximoCicloApos('2026-08-31', 6)`
   devolve o **ciclo-toco da transição, 01/09–05/09** (5 dias), e qualquer
   parcela vencendo depois de 05/09 cai fora da janela. Ver §7 risco 6.

### Decisões e correções da Fase 7

- **Chassi com 3 abas desde já.** `/custos/parcelados` e `/custos/variaveis`
  nascem como `EmptyState` com ação para `/ciclo` (regra 9 da SPEC), em vez de
  aba apontando para 404. As Fases 8 e 9 trocam só o corpo da página.
- **`recalcularCicloAtualSeVazio` passou a devolver `EfeitoNoCicloAtual`** —
  união discriminada em que o ramo "não recalculou" nem consegue citar
  `verbaAntesCents`. É o que torna possível a mensagem bifurcada do §4.3 item 0;
  `mensagem-efeito.ts` é o único lugar que escolhe a frase, então nenhuma ação
  escapa para a versão genérica.
- **Barra de totais = ciclo 1 de `obterProjecao(deps, { numCiclos: 1 })`.**
  Nenhum cálculo novo e nenhum "quanto sobra" paralelo capaz de divergir da
  tela Hoje.
- **`menu-acoes.tsx` é novo e ficou em `components/custos/`, não em `ui/`.** O ⋯
  do §4.1 não existia nas primitivas da Fase 3, e a implementação óbvia
  (`absolute` na linha) seria recortada: `Table` envolve tudo num
  `div.overflow-x-auto`, e `overflow-x:auto` computa `overflow-y:auto` junto —
  o mesmo motivo pelo qual `TooltipPortal` existe. Feito com portal `fixed`,
  `role="menu"`, ↑↓/Home/End, Escape devolvendo foco ao gatilho e fechamento em
  scroll/resize. Só vira primitiva global se a Fase 8 confirmar o padrão.
- **Reativar era uma promessa quebrada, corrigida na hora.** A lista mostra
  custos desativados e o `ConfirmInline` prometia "dá para reativar quando
  quiser", sem nenhuma ação que fizesse isso — a mesma classe de defeito que o
  §4.1 legisla contra no caso do excluir com FK `Restrict`. Entraram
  `reativarCustoFixo`/`reativarProvisao` (casos de uso + actions + itens de
  menu), devolvendo o mesmo `EfeitoNoCicloAtual`, porque reativar mexe em
  `fixosCents` tanto quanto desativar. Os dois casos novos entraram na tabela
  `ESCRITAS` de `autorizacao.test.ts`.
- Editar **nunca** reativa por acidente: o `fixo-form` preserva `ativo`, e
  reativar é ação própria e explícita.

### Decisões e achados da Fase 8

- **`aplicarLote` é uma porta, não um Unit-of-Work.** A alternativa (um
  `deps.transacional(fn)` devolvendo um `Deps` amarrado ao `tx`) obrigaria
  todos os repositórios a aceitarem `Prisma.TransactionClient` — que não tem
  `$transaction`, usado por `criarVarias`. `aplicarLote` recebe deltas JÁ
  AGREGADOS (`somarEfeitos`), então o repositório não conhece regra de sinal
  por tipo de transação; isso continua sendo domínio.
- **`somarEfeitos` deu um ganho não planejado em `regenerarParcelas`:** o
  ajuste aplicado é o LÍQUIDO entre reverter as antigas e aplicar as novas.
  Editando só a descrição de uma compra ligada a conta, o saldo não é mais
  debitado e recreditado — o delta é zero e nenhuma linha de `Conta` é tocada.
- **`valorMensalCents` vem da parcela CORRENTE, não de `total / n`.** A divisão
  é `floor` com resto na última, então a média mente em centavos em quase todas
  as linhas e a última mente em todas as outras.
- **`metodo` entrou em `PatchParcelamento` SEM guarda de retroatividade.** Ele
  não aparece em nenhuma fórmula (`gastoRealizadoCents` filtra por GRUPO da
  categoria), só na quebra por método de `/analise`. Exigir confirmação
  retroativa para um campo inócuo treina o dono a clicar "confirmar" sem ler —
  que é como a guarda de verdade perde o efeito.
- **A ordenação saiu do componente** para `ordenacao-parcelados.ts`, sem JSX: o
  ambiente de teste é `node` e não importa `lucide-react`. Ordenação default
  (`terminaEm` asc) é contrato do §3.2 e agora tem teste.
- **Limitação assumida:** o carimbo de `encerradoEm` fica FORA do lote (é outra
  tabela, outro repositório). Se ele falhar depois de o lote passar, as
  parcelas já sumiram e a compra continua "em andamento" — recuperável
  clicando encerrar de novo (a operação é idempotente), ao contrário do saldo
  creditado em dobro, que não era.

### Achados da revisão no navegador (10/08/2026)

Os portões são estáticos e não provam layout. Abrir a tela com os dados reais
do dono pegou dois defeitos que `tsc`/Vitest/`next build` não pegariam:

1. **A seção não existia no mobile.** O plano mandou acrescentar `Custos` à
   sidebar (posição 3) e foi o que a Fase 7 fez — mas a barra inferior do
   mobile é **outro componente** (`src/components/nav.tsx`), e ficou sem a
   entrada. `/custos` só era alcançável por URL digitada num aparelho. Lição:
   o app tem **duas** listas de navegação, e as duas precisam da mesma ordem.
2. **Dois "fixos por mês" divergentes, sem rótulo.** A barra de totais mostrava
   `Fixos R$ 4.884,00 · por mês` (vindo do ciclo **congelado**) e logo abaixo
   `Custos fixos · R$ 5.605,00/mês` (o **cadastro de hoje**). Os dois estão
   certos e divergem por construção sempre que um custo muda depois de o ciclo
   nascer — mas lado a lado, sem rótulo, leem-se como erro de soma. A barra
   passou a dizer `no ciclo atual` e os títulos das listas, `cadastro atual`.
   O banner de congelamento explicava a **verba**, não os fixos.

Verificado na mesma passagem, funcionando: o menu ⋯ não é recortado pelo
`overflow` da tabela; o `ConfirmDialog` de "não pode ser excluída" traz a
contagem real do servidor e tem saída única; o `ConfirmInline` de recálculo
mostra `passa de R$ 7.116,00 para R$ 14.395,00` com o botão `Passar para
R$ 14.395,00`; `/config` ficou com a link-linha e sem o CRUD duplicado; console
do navegador limpo, sem hydration mismatch.

### Decisões fechadas na Fase 6

- **A dúvida do §2.4(b) — estender a entrada ou enriquecer no read-model — foi
  resolvida estendendo `ObrigacaoFutura`** com `descricao`/`parcelaNum`/
  `numParcelas` **opcionais**. `terminamNesteCiclo` precisa comparar
  `parcelaNum === numParcelas`; enriquecer só no read-model deixaria o motor sem
  como decidir isso, e a marcação de fim de parcela sairia da função pura.
- Como a entrada é opcional, os campos correspondentes de `ObrigacaoDoCiclo` são
  **nuláveis** — o plano os tipava não-nulos. Fingir não-nulo obrigaria a um
  default inventado (`''`/`0`) num campo que o tipo jura existir.
- **Vigência = sobreposição de intervalos**, `(vigenteDe == null || vigenteDe <= fim)
  && (vigenteAte == null || vigenteAte >= inicio)`, **sem rateio proporcional**:
  custo que acaba no meio do ciclo conta inteiro nele (a última fatura chega
  cheia; ratear produziria verba otimista).
- `custosComVigencia` **nunca** toca o `cicloCongelado` — há teste com vigência
  já encerrada que excluiria o custo de todo o horizonte e mesmo assim o ciclo 1
  mantém o `fixosCents` gravado (R1).
- Cenário hipotético preenche `descricao`/`parcelaNum`/`numParcelas` mas mantém
  `parcelamentoId: null`, logo nunca aparece em `terminamNesteCiclo` — aquela
  lista é sobre compromisso real acabando.
- Dívida do §5.3 item 3 paga: `formatarDataCurta` saiu das 6 cópias para
  `src/shared/data.ts`, junto com `formatarMesAno` (`ago/26`) e
  `MESES_ABREVIADOS_PT_BR`, que migrou de `agregacoes.ts` para o kernel.

### Efeito colateral da consolidação de `formatarDataCurta`

A cópia local era tolerante e devolvia `"undefined/undefined"`; a versão
compartilhada valida com `assertData` e **lança**. Em
`curva-patrimonio-chart.tsx`, o `TooltipCurva` recebe `data === ''` quando o
payload do Recharts não traz o ponto — passaria a quebrar dentro do render.
Guardado com `data === '' ? '' : formatarDataCurta(data)`.

### Correção de contrato: "futura" ≠ "não paga" (decidido em 10/08/2026)

O plano dizia "cancela as parcelas **futuras**"; a primeira implementação usou
"**não paga**". Não é o mesmo conjunto — `pagoEm` é marcação manual do
`PagamentoToggle`, e o dono raramente marca. Apagar por "não paga" sozinho faria
sumir gasto de meses passados que já caiu no cartão.

Critério final, com **três** condições simultâneas: `pagoEm == null` **e** fora de
ciclo fechado **e** `data > hoje`. Parcela vencida e não marcada é preservada.

### Bug CRÍTICO encontrado na auditoria da Fase 5

`editarCamposLivres` reescrevia `categoriaId` de **todas** as parcelas, inclusive
as de ciclo fechado, sem passar pela guarda de retroatividade — com um docblock
afirmando que era seguro porque "não mexe em dinheiro nem em datas".

A afirmação é falsa: `sobraCiclo` → `gastoRealizadoCents` →
`contaComoVerbaVariavel` (`src/domain/finance/teto.ts`) filtra por
`grupoCategoria === 'VARIAVEL'`. **A categoria decide se o gasto conta como verba
variável**, então trocá-la muda o gasto realizado do ciclo. Reclassificar uma
compra de *Casa* para *Contas fixas* — edição que a UI apresenta como cosmética —
corrompia `sobraCents` de todos os ciclos fechados com parcelas dela.

Passou despercebido porque o teste de `editarCamposLivres` usava **duas
categorias do mesmo grupo**. Lição: teste de categoria precisa cruzar `grupo`,
não só trocar o id.

Corrigido com guarda + recálculo de sobra, mais recusa de categoria de grupo
≠ VARIAVEL quando há parcela em ciclo aberto (senão dá para "sumir" com uma
parcela do teto diário escolhendo categoria FIXO — D-11 pela porta dos fundos).

### Tickets abertos (não bloqueiam as próximas fases)

-1. **`ExcluirFixoDialog` propõe "Desativar" a um custo já desativado.** Numa
   linha inativa com `PagamentoFixo` registrado, o menu mostra `Reativar` + "Por
   que não dá para excluir?", e o diálogo daquele caminho segue oferecendo
   desativar. Incoerência menor; o caminho é raro.
-2. **`ListaContas`/`ListaCategorias` seguem no padrão antigo de dinheiro**
   (`Input` de texto livre + `parseBRL`) em `gerenciadores.tsx`. `CampoDinheiro`
   já existe e a troca é mecânica — débito do §5 item 4.
-3. **`ProvisaoEmUsoError` só aparece depois do submit**, sem checagem prévia
   como a de `PagamentoFixo`: exigiria contagem por `Transacao.provisaoId`.
0. **`criarDeps` (`src/application/__fakes__/fakes-ciclo-fechamento.ts`) não
   aceita `parcelamentos`** em `OpcoesFakeDeps` — instancia um
   `FakeParcelamentoRepo` sempre vazio, enquanto todos os outros repos recebem a
   semente. Os testes da Fase 6 semeiam por `deps.parcelamentos.itens.push(...)`.
   Adicionar a opção quando alguém encostar no arquivo.


~~1. Sem transação de banco em `encerrarParcelamento`/`regenerarParcelas`.~~
   **PAGO na Fase 8** — porta nova `TransacaoRepository.aplicarLote` (exclui,
   cria e ajusta saldo/acumulado num único `$transaction`).
~~2. `regenerarParcelas` descarta `contaId`/`provisaoId` das parcelas antigas.~~
   **PAGO na Fase 8** — preserva os da primeira parcela, como já fazia com `metodo`.
~~3. N+1 sequencial em `listarParcelamentos`.~~ **PAGO na Fase 8** —
   `criarCacheCiclos` (cache de PROMESSA, dedupa concorrentes) + resumos em paralelo.
~~4. `revalidatePath` esquece `/analise` e `/fechar-ciclo`.~~ **PAGO na Fase 8**,
   mais `revalidatePath('/custos', 'layout')` para a barra de totais.
~~5. `terminaEm` depende da ordenação implícita de `listarPorParcelamento`.~~
   **PAGO na Fase 8** — ordem virou contrato documentado no port E `terminaEm`
   passou a ser `max(data)`, para não depender dela.
~~6. `criarParcelamento` nunca valida o grupo da categoria.~~ **PAGO na Fase 8** —
   `validarCategoriaVariavel` mudou para `src/application/categoria-parcela.ts`
   (evita ciclo de imports) e roda antes de qualquer escrita.
8. **`app/ciclo/page.tsx` ainda tem uma cópia local de `formatarDataCurta`**
   (linha final do arquivo), apesar de a Fase 6 ter consolidado as 6 cópias em
   `src/shared/data.ts`. É a 7ª, que escapou por estar num `app/` e não num
   `src/components/`. Trocar é mecânico; não foi tocado na Fase 9 para o diff
   ficar só sobre gasto variável.
7. **Hydration mismatch pré-existente** em
   `src/components/patrimonio/novo-snapshot-form.tsx:25`: `crypto.randomUUID()`
   dentro do inicializador de `useState` gera ids diferentes no servidor e no
   cliente, quebrando `htmlFor`/`id`. Corrigir com `React.useId()`.

### NUNCA rodar `pnpm build` com o dev server no ar

Os dois escrevem no mesmo `.next`; o build sobrescreve os assets e o dev server
passa a servir HTML apontando para arquivos que não existem mais. Sintoma: a
aplicação aparece **sem CSS nenhum**, e `/_next/static/css/app/layout.css` dá 404.
Aconteceu de verdade nesta sessão.

O `next.config.ts` já previa isso: `distDir: process.env.NEXT_DIST_DIR || '.next'`.
Para rodar o portão de build sem derrubar o dev:

```bash
NEXT_DIST_DIR=.next-verify pnpm build
```

Recuperação, se acontecer: `rm -rf .next && pnpm dev`, e refresh forçado no
navegador (o 404 fica em cache).

### Bug ALTO encontrado na auditoria da Fase 4

`recalcularCicloAtualSeVazio` (`src/application/ciclos.ts`) filtrava por "ciclo
vazio" mas **nunca por "ciclo fechado"**, e `obterAtual` devolve qualquer ciclo
que cubra hoje — fechado inclusive. Como `fecharCiclo` não exige `dataFim < hoje`,
dava para fechar o ciclo corrente e, em seguida, ter `fixosCents`,
`verbaVariavelCents` e até `rendaPrevistaCents` reescritos por uma edição de custo
fixo — depois da sobra apurada e do rollover creditado. Corrupção silenciosa da
regra R1.

O buraco era pré-existente (`upsertCustoFixo` já chamava), mas a Fase 4
quadruplicou as portas de entrada. Corrigido com `if (ciclo.fechado) return;`.

**Lição para os testes:** o `describe('R1 — passado é congelado')` original usava
um ciclo que **não cobria "hoje"**, então `obterAtual` nunca o alcançava e os
testes passavam mesmo com a função corrompendo ciclos fechados. Todo teste de R1
precisa de um ciclo fechado **que cubra a data de "hoje" do relógio fake**.

**Ordem trocada de propósito:** a migração veio antes das portas, para os
repositórios nascerem já com os campos novos em vez de `prisma-repositories.ts`
ser tocado duas vezes.

### `prisma migrate dev` não funciona neste repo — e não é bug desta feature

`migrate dev` usa um **shadow database** que replaya todas as migrações do zero,
e `20260804200000_multi_tenant_dono_id` aborta de propósito quando não há usuário
OWNER (`RAISE EXCEPTION`). A guarda está certa para o banco real e é fatal num
banco vazio, então isso vale para **toda migração futura**. O fluxo que funciona:

```bash
# 1. editar prisma/schema.prisma
# 2. conferir o SQL que o Prisma geraria (NÃO aplicar direto):
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma \
                        --to-schema-datamodel  prisma/schema.prisma --script
# 3. escrever prisma/migrations/<timestamp>_<nome>/migration.sql à mão
npx prisma db execute --file prisma/migrations/<...>/migration.sql --schema prisma/schema.prisma
npx prisma migrate resolve --applied <timestamp>_<nome>
pnpm db:generate   # e reiniciar o dev server
```

**Armadilha do passo 2:** `migrate diff` quer **dropar `Memoria_embedding_hnsw_idx`**,
porque o índice HNSW do pgvector é criado por SQL cru e não existe no
`schema.prisma`. Copiar o diff cru degradaria a busca da memória do copiloto para
varredura sequencial, em silêncio. O índice fica de fora da migração de propósito.

### Achado colateral: o backup teria quebrado

`custoFixoSchema` e `parcelamentoSchema` em `src/infrastructure/backup.ts` usam
`.strict()`, que **rejeita** chave desconhecida em vez de descartá-la. Como o
export usa `findMany` (todos os campos), um backup gerado depois desta migração
falharia ao ser importado. Os dois schemas ganharam os campos novos como
`nullish()` — ausente em backup antigo = comportamento de sempre.

## 6. Fases

Cada fase termina com `pnpm test` verde, `pnpm typecheck` limpo, `next build`
verde e `pnpm verificar:isolamento` passando.

> **Lembrete do `CLAUDE.md`:** depois da Fase 2 (migração), **reiniciar o dev
> server** — o Prisma Client fica em memória e continua servindo o schema antigo.
> Recuperação: `pnpm db:generate && rm -rf .next && pnpm dev`.

### Fase 1 — Portas e repositórios (sem UI)
Estender as 4 interfaces de §2.2 e implementar nos adapters com
`findFirst`/`updateMany`/`deleteMany` + `donoId`.
**Aceite:** `pnpm verificar:isolamento` cobre os métodos novos — dois donos reais,
tentativa de vazamento nos dois sentidos.
**Risco:** reintroduzir `findUnique({ id })` → vazamento entre donos. Revisão
dedicada obrigatória neste diff.

### Fase 2 — Migração aditiva
`CustoFixo.vigenteDe/vigenteAte`, `Parcelamento.encerradoEm`. Todos nullable.
**Aceite:** build verde, seed idempotente, suíte existente intocada.

### Fase 3 — Primitivas de UI
`Table`/`SortableTh`, `Tabs`, `Segmented`, `ConfirmDialog` + extração do `Toast`.
Migrar `config-geral.tsx` do `tabCls()` ad-hoc para `Tabs`.
**Aceite:** teclado completo (←→/Home/End nas abas, `aria-sort` anunciado); foco
visível; `ConfirmDialog` prende foco e devolve ao gatilho.

### Fase 4 — Casos de uso de custos fixos e provisões
`listarCustosFixos`, `desativarCustoFixo`, `excluirCustoFixo` (recusa com
`PagamentoFixo`), `excluirProvisao` (recusa com acumulado ≠ 0), vigência no
`upsertCustoFixo`. Server actions + zod.
**Testes:** excluir custo com pagamento é recusado com mensagem acionável;
excluir provisão com acumulado é recusado; **editar custo não altera
`Ciclo.fixosCents` de ciclo fechado** (R1).

### Fase 5 — Caso de uso de parcelamento (a parte mais delicada)
`listarParcelamentos`, `encerrarParcelamento`, `editarParcelamento`. Reusar a
guarda de retroatividade de `transacoes.ts` (extrair para módulo compartilhado).
Rateio via `ratearCents`.
**Risco alto.** Testes obrigatórios:
- parcela paga permanece intocada após encerrar;
- parcela futura em ciclo fechado exige confirmação (R2);
- `soma(parcelas) === valorTotal` após qualquer edição;
- `encerradoEm` carimbado e o parcelamento some da lista "Em andamento";
- a projeção deixa de contar as parcelas canceladas no ciclo seguinte.

### Fase 6 — Domínio da projeção
`fixosVigentesNoCicloCents` + parâmetro opcional em `projetarCiclos`;
`obrigacoesDoCiclo` e `terminamNesteCiclo` em `CicloProjetado`; `periodoLabel`.
**Não editar os testes existentes** — a compatibilidade por default os mantém
verdes (R6). Testes novos: "parcela de 12× comprada em 03/2026 some do ciclo
03/2027"; "custo fixo com `vigenteAte` em 12/2026 não entra no ciclo 01/2027".
**Risco:** mudar a assinatura de `projetarCiclos` quebraria as ferramentas de IA →
por isso o parâmetro é opcional.

### Fase 7 — `/custos/fixos`
Valida o chassi de abas + barra de totais + banner de congelamento. Move
`ListaCustos`/`ListaProvisoes` de `/config` e deixa a link-linha lá.

### Fase 8 — `/custos/parcelados`
Tabela agrupada por compra + linha expansível + `encerrar-parcelamento-dialog`.

### Fase 9 — `/custos/variaveis`
**Primeiro** a extração de `ExtratoVariaveis` com `escopo` e do form de edição
duplicado; depois a tela com filtros de período/categoria/método.

### Fase 10 — `/projecao`
Manchete + tabela primeiro (já é útil sozinha e é o *table-view twin*), gráfico
depois. Mobile é a lista, não o Recharts.

### Fase 11 — Prévia e simulação no modal de parcelamento
Fecha o laço entre A e B. É a feature que muda comportamento: o dono vê o custo
futuro antes de assumir a parcela.

---

## 7. Riscos transversais

1. **Retroatividade silenciosa** — o maior. Qualquer edição/exclusão que toque
   ciclo fechado fora da guarda corrompe `sobraCents` **sem erro nenhum**.
2. **FK `Restrict` do Postgres** — ao contrário do antigo SQLite, delete com filhos
   falha no banco. Tratar no caso de uso, com mensagem acionável, nunca deixar o
   erro do Prisma vazar para a tela.
3. **Dobra de parcela** — parcela consome o teto, não é deduzida da verba (R3).
   Nenhum enriquecimento da projeção pode violar isso.
4. **Terceira cópia do extrato de variáveis** — mitigado pela ordem da Fase 9.
5. **Prisma Client velho após a Fase 2** — reiniciar o dev server.
6. **O ciclo-toco da transição de `diaRecebimento`** (descoberto em 10/08/2026,
   nos dados reais do dono, **pré-existente e fora do escopo destas features**).
   A `Config` está com `diaRecebimento = 6` e o ciclo em curso nasceu com dia 1,
   então o próximo ciclo será **01/09–05/09, de 5 dias** — e nem `fixosCents`,
   nem `poupancaAlvoCents`, nem `provisaoMensalCents` são rateados por dias:
   são valores mensais. Um ciclo de 5 dias vai reservar um mês inteiro de custo
   fixo e de poupança-alvo, e a verba variável dele fica absurdamente negativa.
   Isso atinge `garantirCicloAtual`, a projeção (`proximoCicloApos` é a mesma
   função) e o marcador "acaba no próximo ciclo".
   **É decisão de produto, não bug de implementação:** ou o ciclo-toco é
   absorvido pelo anterior, ou os valores mensais passam a ser rateados por
   dias, ou trocar `diaRecebimento` passa a exigir confirmação explícita
   dizendo o que vai acontecer com o mês da virada. Nenhuma das três está
   escolhida.

## 8. Aberto para depois

- **Excluir parcelamento por inteiro, incluindo parcelas pagas.** Fora do escopo
  por decisão de 10/08/2026. Exigiria recalcular a sobra de ciclos fechados e
  migração para afrouxar a FK.
- **Reajuste de custo fixo** ("meu aluguel sobe em março"). `vigenteDe/vigenteAte`
  permite encerrar um custo e criar outro, mas não modela reajuste como evento.
  Vira pedido natural assim que a projeção de 24 meses for usada para decidir.
- **Renda variável por mês.** A projeção assume renda constante; o bloco Premissas
  declara isso. Se a renda do dono deixar de ser fixa, é a próxima peça.

---

## 9. Fase 10 — achados da revisão no navegador (10/08/2026)

Portões: `tsc` limpo · **913 testes** verdes · `next build` verde. A tela foi
montada por **três agentes em paralelo** com propriedade exclusiva de arquivos
(read-model · gráfico · integração), e a costura entre eles é o que expôs os
dois achados abaixo.

### 1. O §3.4 está errado num ponto: o topo da pilha NÃO é a renda

Dois agentes chegaram nisso independentemente. É estrutural, não resto de `floor`:

```
fixos + provisão + poupança + parcelas + verbaLivre  ===  renda + rollover
```

e no ciclo 1 pós-`puxarDaReserva` a verba **gravada** deixa de ser a soma das
partes (SPEC 5.2) e é ela que vale — num fixture a pilha dá R$ 9.100 contra
renda de R$ 8.000. Existe agora `LinhaProjecao.totalComposicaoCents`, a única
altura que fecha nos três casos, e é contra ela que o gráfico empilha.

Consequência para o plano: o argumento do §3.4 para pôr a verba livre no topo
("o topo da pilha é a renda prevista, quase plana, então o teto não dança")
**vale só para os ciclos ≥ 2**. No ciclo atual com rollover, o teto balança.
A escolha segue certa; a justificativa é que precisa de asterisco.

### 2. O ciclo-toco (risco 6) contamina a MANCHETE

Com `diaRecebimento = 6` e o ciclo atual nascido no dia 1, a projeção emite
**dois ciclos em setembro**: 01/09–05/09 (5 dias) e 06/09–05/10. O toco reserva
um mês inteiro de fixos e de poupança-alvo mas **não pega nenhuma parcela**, e
o resultado nos dados reais do dono é:

| mês | parcelas | verba livre | Δ |
|---|---|---|---|
| ago/26 | 4.123,88 | 2.992,12 | — |
| **set/26 (1–5)** | **0,00** | **14.395,00** | **+11.402,88** |
| set/26 (6/9–5/10) | 4.123,88 | 10.271,12 | −4.123,88 |

O **maior degrau de todo o horizonte é o artefato da transição**, e a manchete
— a frase que existe para responder "quando a verba respira?" — anuncia
`+R$ 11.402,88` como se fosse boa notícia. Não é: são 5 dias.

**Corrigido só o que era defeito de apresentação:** `periodoLabel` desambigua
quando dois ciclos caem no mesmo mês (`set/26 (1–5)` / `set/26 (6/9–5/10)`),
porque duas linhas com o mesmo nome numa tabela feita para conferência contra
planilha é defeito em qualquer cenário. A desambiguação só aparece quando há
colisão de verdade.

**NÃO corrigido, porque é decisão de produto (risco 6):** a manchete continua
elegendo o degrau do toco. Enquanto o ciclo-toco existir, a projeção vai
destacá-lo. As três saídas seguem as do risco 6 — absorver o toco no ciclo
anterior, ratear valores mensais por dias, ou exigir confirmação ao trocar
`diaRecebimento`. Voltar `diaRecebimento` para 1 elimina o sintoma sem código.

### Não verificado

**O mobile de `/projecao` não foi aberto.** A janela do Chrome travou em 1440px
na sessão de revisão. O integrador reporta 7 itens na barra inferior a 375px
(~48px por célula) com rótulo truncado — "Patrimônio" pode ellipsizar. A
solução real é encurtar rótulos ou trocar a barra por um "mais…", que é
mudança de escopo de navegação.

### Fora do escopo entregue

O §3.4 promete `[ ⛭ Simular compra… ]` no cabeçalho. `projetarComCenario` e
`obterProjecao({ cenario })` já existem desde a Fase C, mas o botão não foi
entregue — é a Fase 11.
