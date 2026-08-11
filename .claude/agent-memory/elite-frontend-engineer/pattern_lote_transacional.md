---
name: pattern-lote-transacional
description: Por que atomicidade multi-repositório neste app virou a porta `TransacaoRepository.aplicarLote` em vez de um Unit-of-Work, e o que isso exige de quem escreve caso de uso novo.
metadata:
  type: project
---

Escrita que precisa ser TUDO OU NADA e atravessa mais de uma tabela passa pela
porta `TransacaoRepository.aplicarLote({ excluir, criar, ajustesConta,
ajustesProvisao })` — um único `$transaction` no adapter Prisma. O caso de uso
agrega os deltas antes com `somarEfeitos` (`src/application/transacoes.ts`), que
é puro; o repositório nunca conhece regra de sinal por tipo de transação.

**Why:** a alternativa idiomática (um `deps.transacional(fn)` devolvendo `Deps`
amarrado ao `tx`) esbarra num detalhe concreto: `Prisma.TransactionClient` não
expõe `$transaction`, e `criarVarias` depende dele — todos os repositórios
teriam que mudar de assinatura. O modo de falha que motivou a porta era real:
cancelar parcelas fazia 3 round-trips por parcela e uma falha no meio creditava
saldo de parcela que continuava viva; o retry creditava de novo.

**How to apply:** caso de uso novo que apaga/cria `Transacao` junto com ajuste
de `Conta.saldoCents` ou `ProvisaoAnual.acumuladoCents` deve usar `aplicarLote`,
não o par `aplicarEfeitoSaldo`/`aplicarEfeitoProvisao` em laço (esses ficaram só
para a escrita unitária). `aplicarLote` usa `deleteMany`/`updateMany` com
`donoId` — id alheio afeta ZERO linhas em vez de lançar, então a prova de
isolamento é "os dados do outro dono não mudaram", não "deu erro":
`scripts/verificar-isolamento.ts` tem a seção "LOTE TRANSACIONAL" para isso.
Ver também [[pattern_pago_toggle]].
