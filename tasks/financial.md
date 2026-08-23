# financial — Estado Atual

**Atualizado**: 2026-08-22

## Concluido recentemente
- **Histórico reescrito para tirar a autoria errada** (22/08): 3 commits raiz estavam
  como `HendrickPacheco-S2R <h.pacheco@sell2rent.com>` (e-mail corporativo vazado pelo
  `git config` global da época). `git filter-repo --mailmap` mapeou para
  `hendrickrpp@hotmail.com`; tree da `main` idêntica antes/depois (`a0f3d5a`), só
  metadado mudou. **Todos os hashes mudaram** — `main` 0b00297 → 4e6540f, force-push
  feito. Os `refs/pull/*` dos PRs #1–#5 no GitHub são imutáveis e AINDA guardam o
  e-mail antigo; só o suporte do GitHub apaga.
- **`prisma.config.ts`** (22/08): bloco `prisma` do `package.json` migrado antes do
  Prisma 7. Pegadinha tratada: com config presente o CLI PARA de carregar `.env`
  sozinho — resolvido com `process.loadEnvFile` (nativo, Node 20.6+), sem dependência.
- **PR #5 mergeado na main**: sessões de conversa do copiloto + 2 ferramentas novas.
  `tsc` limpo · **1062 testes** verdes · isolamento OK · 8 migrações.
- **Conversas persistentes**: tabelas `Conversa`/`MensagemConversa`, histórico saiu do
  cliente e passou a vir do banco, lista com renomear/excluir, painel 2 colunas no
  desktop (mobile intocado). Card de proposta reaberto é INERTE.
- **`simular_meta_prazo`** ("quanto guardar por mês para juntar X até a data Y") e
  **`simular_renda`** ("se a renda cair para X, dou conta?"). Copiloto: 14 → 16 ferramentas.
- **Alerta "valor sem origem" parou de acusar o dono**: 3 baldes (veio de ferramenta /
  veio do dono / não veio de lugar nenhum). Só o 3º alerta.
- **Conciliação razão × realidade** (PR anterior): `ItemPatrimonio.contaId`,
  `divergenciasConciliacao`, ação `aceitarRealidade`. `salvar` substitui snapshot da
  mesma data (antes estourava a unicidade com erro cru do Prisma na tela).
- **Bugs latentes pegos em revisão**: ordem das mensagens colidindo em milissegundo
  (histórico chegaria invertido ao modelo); grafia "70.000" ainda alertava; proveniência
  perdida por NBSP vs espaço comum.
- **Corrigidos**: hidratação de `/patrimonio` (`randomUUID` em `useState`), `$transaction`
  em `encerrarParcelamento`, `revalidatePath` faltando `/analise` e `/fechar-ciclo`,
  `.env.example` sem credencial.
- **Dados do dono**: meta 10k → **18k**, `diaRecebimento` 6 → **1** (eliminou ciclo
  fantasma de 5 dias com um mês inteiro de verba), saldo da conta Reserva preenchido (60k).

## Pendente
- **A UI das conversas NUNCA foi aberta no navegador.** Layout 2 colunas, hover dos
  botões renomear/excluir, ciclo perguntar → confirmar proposta → sair → voltar.
  Está na main sem verificação visual.
- `.claude/agent-memory/` (4 arquivos) fora do controle de versão, de propósito.
- Conversa **fora do backup** por decisão — restaurar backup não toca nas conversas.
- Sem alerta quando o saldo da conta diverge do snapshot no TOTAL (a conciliação é por
  linha e só aparece se o item tiver `contaId`).
- **5 branches ressuscitados no GitHub** pelo force-push (os refs `origin/*` locais
  estavam obsoletos: já tinham sido deletados após os PRs). Deletar com
  `git push origin --delete feat/copiloto-sessoes-e-ferramentas feat/custos-e-projecao
  feat/parcelamento-manual-no-painel worktree-auth-roles-seguranca
  worktree-agent-af1ae1b780629682f`. Só `main` e `feat/ia-memoria-e-escrita-por-proposta`
  existiam antes.
- Considerar `git config --global user.useConfigOnly true` — faz o git RECUSAR commit
  onde o `user.email` não foi setado explicitamente, em vez de adivinhar. É a trava que
  teria evitado o e-mail corporativo no histórico.

## Bugs conhecidos
**Nenhum aberto.** Os da lista anterior foram re-verificados em 22/08 e estão fechados:
- `regenerarParcelas` preserva `contaId`/`provisaoId` (lidos da primeira parcela —
  `parcelamentos.ts:537-550`).
- `listarParcelamentos` usa `Promise.all` + cache de janela, não é mais sequencial.
- Os 5 `it.skip` marcados `[BUG]` em `application/` sumiram: `grep -rn "\.skip" src/`
  não retorna nada e os 4 `[BUG]` restantes são `it(` normal — viraram regressão ativa.
- A lacuna D-15 de `simular_meta_prazo` foi fechada: `poupancaAlvoOriginalCents` e
  `reducaoPorExcedenteCents` viajam do domínio (`meta-prazo.ts:132`) até a saída da
  ferramenta com motivo em texto (`ferramentas/projecao.ts:176`), com teste afirmando
  os valores. Não sobrou `it.fails` no repo.

## Decisoes
- **D-13** — razão (`Conta.saldoCents`) e realidade (`ItemPatrimonio.valorCents`) são
  fontes distintas. A diferença É informação (gasto não lançado, rendimento);
  sincronizar em silêncio destruiria o sinal. Só `aceitarRealidade` escreve, e ajusta
  saldo direto SEM criar `Transacao` (correção de registro não consome teto diário).
- **D-14** — indicador que não dá para calcular explica POR QUÊ. Booleano mudo fez o
  copiloto inventar a causa: culpou os custos fixos com 12 cadastrados.
- **D-15** — número derivado viaja com suas partes. `verbaVariavel` saía como átomo e o
  copiloto NEGOU ao dono que a poupança já estivesse descontada. Erro que causa: dupla
  contagem. Ver `composicaoDaVerba` em `ferramentas/saida.ts`.
- **Proveniência nunca volta ao modelo** — só `conteudo` vira histórico. O mapeamento
  para `MensagemIA` aceita estruturalmente só `{papel, conteudo}`.
- **Card de proposta reaberto é inerte**, em arquivo que nem importa `confirmarProposta`.
  Proposta não é persistida como confirmada → reabertível permitiria duplicar transação.
- **Conversa nasce só depois da resposta bem-sucedida** — falha do provedor não deixa
  conversa vazia nem pergunta órfã. `anexarTurno` grava o par em transação com
  `criadaEm` explícito (1ms de separação; `TIMESTAMP(3)` não desempata sozinho).
- **`prisma migrate dev` é inutilizável neste repo**: o shadow DB replaya num banco vazio
  e a migração multi-tenant aborta sem OWNER. Fluxo: SQL à mão → `migrate resolve
  --applied` → `psql -f`. **`migrate diff` sempre quer dropar `Memoria_embedding_hnsw_idx`**
  (pgvector, SQL cru) — nunca copiar o diff cru.
- **NUNCA `pnpm build` com o dev server no ar** — mesmo `.next`, a app fica sem CSS.
  Usar `NEXT_DIST_DIR=.next-verify pnpm build`. Aconteceu de novo em 11/08.
- **Nada de aleatoriedade em render de SSR** (`randomUUID`/`Math.random` em `useState`)
  — ids determinísticos + `useId()`. Dentro de handler de evento é seguro.
- Anteriores seguem valendo: D-11 (parcela consome verba, não é deduzida), D-8 revisada
  (IA propõe, dono confirma), DA-3 (IA OWNER-only com teto), memória nunca guarda
  dinheiro, multi-tenant escopado só em `composition.ts`, monolito hexagonal.

## Stack
- Next.js 15 (App Router) · React 19 · TypeScript estrito (zero `any`)
- PostgreSQL 16 local (`financial_dev`) + Prisma 6 + pgvector 0.8.6
- Vitest (**1062 testes**) · Tailwind 4 · lucide-react · recharts
- OpenAI SDK 7 (Responses API) · zod + zod-to-json-schema
- Auth própria: Argon2id, sessão em cookie opaco, papéis OWNER/VIEWER
- Hexagonal: `shared/` → `domain/` (model, finance, ia, auth, ports) → `application/`
  → `infrastructure/` (adapters) → `app/` (rotas)
- Scripts: `pnpm projetar [n]` (projeção via CLI), `pnpm verificar:isolamento`
