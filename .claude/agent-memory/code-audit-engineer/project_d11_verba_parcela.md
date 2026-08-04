---
name: d11-verba-parcela
description: Decisão D-11 do dono — parcela CONSOME a verba variável e não é deduzida dela; o texto do CLAUDE.md sobre o teto está impreciso
metadata:
  type: project
---

Decisão **D-11 (resolvida pelo dono, 2026-08-04): o código está certo, o `CLAUDE.md` está
impreciso.** Parcela é `Transacao` DESPESA de grupo VARIAVEL: ela **consome** a verba variável
(come o teto diário) e **não** é subtraída no cálculo da verba. O número "quanto sobra de verdade"
é `verbaLivre = verbaVariavel − parcelasComprometidas`, exposto como campo separado.

**Why:** o `CLAUDE.md` descreve o teto como "renda − fixos − parcelas − provisão − poupança", o que
não é o que `verbaVariavelCents` faz. Quem "corrigir" o código para casar com o texto passa a
contar parcela duas vezes e produz número plausível e falso.

**How to apply:** ao auditar qualquer coisa que toque verba, tratar subtração de parcela dentro do
cálculo da verba como defeito, não como conformidade. O texto do `CLAUDE.md` (regra sobre "sem piso
diário hardcoded" / derivação do teto) ainda não foi corrigido — se aparecer como divergência numa
auditoria, é o texto que está errado.
