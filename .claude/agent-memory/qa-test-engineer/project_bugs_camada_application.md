---
name: bugs-application-marcados-como-skip
description: Cinco testes it.skip marcados [BUG] na camada application/backup representam bugs de produção reais e confirmados, não testes quebrados
metadata:
  type: project
---

Em 2026-08-03 a camada `src/application/` e `src/infrastructure/backup.ts` ganharam
cobertura. Cinco testes ficaram `it.skip` com o prefixo `[BUG]` — todos foram
executados sem o skip e **falham de verdade**; não são testes mal escritos.

Ordem de gravidade acordada: rollover duplicado > sobra descartada > corrida na
criação de ciclo > centavo perdido na provisão > backup sem checagem de versão.

**Why:** o agente de teste não pode editar código de produção; a decisão de
corrigir (e como) é do usuário. Sem esta nota, uma sessão futura pode "consertar"
o teste em vez do bug, ou remover o skip achando que é lixo.

**How to apply:** ao mexer em `fechamento.ts`, `ciclos.ts` ou `backup.ts`,
remover o `.skip` correspondente é o critério de pronto da correção. Antes de
recomendar qualquer um deles como "já corrigido", rodar o teste sem skip para
confirmar o estado atual — o código pode ter mudado desde então.
