# Memória — qa-test-engineer (financial)

- [Bugs da camada application marcados como skip](project_bugs_camada_application.md) — o prefixo `[BUG]` marca bug real; os 5 skips de 03/08 foram corrigidos e viraram regressão ativa.
- [Testes de integração da agent-api](project_testes_integracao_agent_api.md) — pipeline contra Postgres real, armadilhas de setup (ritmoDiario vs verbaLivre, categoria null, rate limiter singleton).
