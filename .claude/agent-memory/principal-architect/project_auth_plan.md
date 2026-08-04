---
name: auth-plan
description: Plano de auth/RBAC/segurança (TASKS-AUTH.md) — recomendação, vulnerabilidades e decisão aberta central
metadata:
  type: project
---

Existe um plano de arquitetura de autenticação/RBAC/segurança em `TASKS-AUTH.md` na raiz do
worktree `auth-roles-seguranca` (branch homônima). Documento, não implementação. Fases S0–S4, ~20
tarefas.

**Recomendação de auth (DA-1, divergindo do pedido literal do dono).** O dono pediu "OAuth2". O plano
recomenda **sessão própria: Argon2id + tabela `Sessao` (token opaco, hash no banco) + cookie
httpOnly** — NÃO NextAuth+Google como primário.
**Why:** app local single-user de uso diário; OAuth2 introduz dependência de rede que quebra o login
offline, e não há identidade para federar. Sessão própria dá revogação instantânea (DELETE da linha)
e funciona offline. Google/OAuth fica como caminho futuro documentado (se virar hospedado/compartilhado).
Lucia-a-lib está descontinuada — usa-se o padrão (oslo), não a lib.
**How to apply:** DA-1 precisa da confirmação do dono antes da Fase S1 começar. S0 (schema aditivo)
pode começar sem ela.

**Roles propostos:** `OWNER` (tudo) e `VIEWER` (read-only). Dois, não três — ADMIN/MEMBER seria
over-engineering para 1 pessoa + leitores.

**Escopo de dados (DA-2):** single-workspace (as finanças são de UMA pessoa; multiusuário = mais
gente olhando o mesmo conjunto). NÃO adicionar `userId` às tabelas financeiras; Config segue
singleton id=1. Migração 100% aditiva → zero risco aos dados reais do dono.

**3 vulnerabilidades mais graves encontradas no código atual:**
1. `app/api/backup/route.ts:8` (GET) e `:20` (POST) — export e **wipe/overwrite** do banco inteiro
   SEM autenticação. `curl` zera os dados reais.
2. `src/infrastructure/backup.ts:119-136,191-216` — import valida só `z.record(string, unknown)` e
   grava via `createMany(... as never)` → mass-assignment/escrita não-validada (agravado por #1).
3. `next.config.ts` sem `headers()` — nenhum CSP/X-Frame-Options/nosniff (clickjacking, sem CSP).

Confirmado NÃO-vulnerável: zero SQL cru (nenhum `$queryRaw/$executeRaw*`); Zod whitelist em todas as
actions de domínio; copiloto de IA é read-only por design (`catalogo.ts` sem tool de escrita).

**Autorização mora na camada de aplicação** (`exigirEscrita(deps.ator)` no topo dos casos de uso de
escrita), não só no middleware — middleware faz authn coarse, app layer faz authz fina (fecha IDOR/V4).
`Ator`/permissões puras em `src/domain/auth/`; `SessaoPort`/`RateLimiterPort` em `src/domain/ports/`.

**Rate limiting:** in-memory por processo para taxa (login/actions); contador durável `UsoIA` em
Postgres para teto de custo da IA (dinheiro real). Sem Redis (1 processo local).

## Atualização pós-execução (04/08/2026)

O plano foi **executado por inteiro**, com uma reversão importante: **DA-2 virou
multi-tenant**. O dono esclareceu que cada login precisa ver apenas as próprias
finanças, então o caminho da §3.2 — documentado ali como "adiado e
desaconselhado" — é o que está em produção: `donoId` em todas as tabelas
financeiras, `Config` por dono, repositórios escopados no composition root,
backup por dono. Ver `TASKS-AUTH.md` §11.

Também foi adicionada uma **tela de cadastro** (`/cadastro`) com código de
convite obrigatório vindo do `.env`; sem `CADASTRO_CODIGO` a rota devolve 404.
Todo usuário novo nasce OWNER do próprio workspace — o papel VIEWER, na prática,
ficou sem uso.
