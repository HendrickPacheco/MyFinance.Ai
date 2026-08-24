---
name: bugs-application-marcados-como-skip
description: O prefixo [BUG] em testes da camada application marca bug de produção real; os cinco skips de 03/08 foram todos corrigidos e os testes viraram regressão ativa
metadata:
  type: project
---

Em 2026-08-03 a camada `src/application/` e `src/infrastructure/backup.ts` ganharam
cobertura. Cinco testes ficaram `it.skip` com o prefixo `[BUG]` — bugs de produção
reais, não testes mal escritos. Ordem de gravidade acordada na época: rollover
duplicado > sobra descartada > corrida na criação de ciclo > centavo perdido na
provisão > backup sem checagem de versão.

**Estado em 2026-08-22: todos corrigidos.** `grep -rn "\.skip" src/` não retorna
nada e a suíte inteira (1062 testes) passa. Os quatro `[BUG]` que restam em
`fechamento.test.ts` e `ciclos.test.ts` são `it(` normal — viraram **testes de
regressão ativos**, e é assim que devem ficar.

**Why:** o prefixo `[BUG]` sobrevive à correção de propósito. Ele marca "aqui já
deu errado uma vez", que é justamente o teste que ninguém pode apagar como
redundante numa limpeza futura.

**How to apply:** `[BUG]` + `it(` = regressão, deixe quieto. `[BUG]` + `it.skip(`
ou `it.fails(` = lacuna aberta, e remover o marcador é o critério de pronto.
Antes de afirmar que qualquer um está aberto ou fechado, rode o grep — esta nota
já ficou desatualizada uma vez.
