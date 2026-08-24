# Memória do principal-architect — Controle Financeiro

## Projeto
- [Plano de Auth/RBAC/Segurança](project_auth_plan.md) — TASKS-AUTH.md: recomenda sessão própria (Argon2id) em vez de OAuth2, roles OWNER/VIEWER, 3 vulns críticas (backup route aberta), e MULTI-TENANT (a decisão single-workspace foi revertida na execução).
- [Copiloto: sessões persistentes](project_copiloto_sessoes.md) — entregue no PR #5; conversas ficam FORA do backup; a fronteira histórico-verbatim (pode ter R$) vs Memoria semântica (nunca R$) é inviolável.
