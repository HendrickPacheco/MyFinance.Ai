---
name: copiloto-sessoes-persistentes
description: Sessões de conversa do copiloto — entregues no PR #5; a fronteira histórico-verbatim (pode ter R$) vs Memoria semântica (nunca R$) é a parte que não pode ser violada
metadata:
  type: project
---

O dono pediu em 2026-08-11 que o copiloto (`/copiloto`) tivesse sessões persistentes.
**Entregue no PR #5** (mergeado em `main`): tabelas `Conversa`/`MensagemConversa`
escopadas por `donoId`, histórico vindo do banco em vez do estado React, lista com
renomear/excluir, painel 2 colunas no desktop.

A decisão que estava pendente foi tomada: **backup NÃO inclui conversas** — restaurar
um backup não toca nas transcrições. Mesma lógica pela qual o embedding já era excluído.

**Why:** a parte desta nota que continua valendo não é o escopo, é a fronteira. Ela
separa duas coisas que parecem a mesma e não são:
- **Histórico de sessão** = transcrição verbatim. PODE conter "R$ X" (o modelo cita
  valores de ferramenta). NUNCA é embeddado nem entra no prompt como "memória".
- **Memoria (pgvector)** = fato destilado, curado, OWNER-only, NUNCA dinheiro
  (regra 7c). O `tipo: CONVERSA` é o fato DESTILADO, via proposta confirmada (D-8),
  não a transcrição crua.

**How to apply:** nenhum caminho pode auto-promover transcrição → Memoria, nem rodar
`validarTextoMemoria` sobre mensagens de chat (elas legitimamente têm R$). Ao mexer em
`Conversa`, lembrar que a FK precisa ser filtrada por dono — é o vetor de vazamento nº1
deste par de tabelas. Ver [[project_auth_plan]] (multi-tenant).
