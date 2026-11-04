/**
 * `rotaAgente` (leitura) e `rotaEscrita` (escrita atômica) — os dois únicos
 * pontos que um arquivo de rota em `app/api/agent/v1/**` deve chamar. Tudo
 * que uma rota precisaria repetir (autenticação, rate limit, parsing,
 * transação, dryRun, auditoria, impacto no ciclo, formatação de dinheiro,
 * mapeamento de erro) vive aqui — a rota só descreve ESCOPO + SCHEMAS +
 * lógica de negócio.
 */
import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';
import type { Prisma } from '@prisma/client';
import { criarDepsAgente, prisma, clienteEmTransacao } from '@/composition';
import { PrismaApiTokenRepository } from '@/infrastructure/repositories/prisma-api-tokens';
import { PrismaUsuarioRepository } from '@/infrastructure/repositories/prisma-identidade';
import type { Deps } from '@/application/deps';
import type { EscopoAgente } from '@/domain/auth/api-token';
import type { AcaoAuditoriaAgente } from '@/domain/ports/auditoria';
import { autenticarAgente, type PortasAutenticacaoAgente } from './autenticacao';
import { aplicarLimiteDeTaxa } from './limite-taxa';
import { comFmt } from './formatacao';
import { mapearErroApi, ehViolacaoDeUnicidade, type ErroApiMapeado } from './erros';
import { objetoDaQuery } from './validacao';
import { executarComPossivelDryRun } from './transacao';
import { montarImpactoCiclo, snapshotImpactoCiclo, type RespostaImpactoCiclo } from './impacto-ciclo';
import { verificarIdempotencia, salvarIdempotencia } from './idempotencia';

type ParametrosDeRota = Record<string, string>;
/** Next.js 15: `params` do segundo argumento de um Route Handler é uma Promise. */
interface SegundoArgumentoDeRota {
  params: Promise<ParametrosDeRota>;
}
type HandlerDeRota = (req: Request, segundo: SegundoArgumentoDeRota) => Promise<Response>;

const PORTAS_AUTENTICACAO: PortasAutenticacaoAgente = {
  buscarTokenPorHash: (hash) =>
    new PrismaApiTokenRepository(prisma, '').buscarPorHashParaAutenticar(hash),
  marcarTokenUsado: (donoId, tokenId, usadoEm) =>
    new PrismaApiTokenRepository(prisma, donoId).marcarUsoAgora(tokenId, usadoEm),
  buscarUsuarioAtivo: (donoId) => new PrismaUsuarioRepository(prisma).porId(donoId),
};

async function autenticarERatelimitar(
  req: Request,
  escopo: EscopoAgente,
): ReturnType<typeof autenticarAgente> {
  const auth = await autenticarAgente(req, escopo, PORTAS_AUTENTICACAO);
  await aplicarLimiteDeTaxa(auth.tokenId);
  return auth;
}

/** Corpo final (sem `dryRun`) já formatado — igual para resposta e replay. */
function montarCorpo(
  resultado: Record<string, unknown>,
  antes: Awaited<ReturnType<typeof snapshotImpactoCiclo>>,
  depois: Awaited<ReturnType<typeof snapshotImpactoCiclo>>,
): unknown {
  const { impactoCiclo, impactoCicloMotivo }: RespostaImpactoCiclo = montarImpactoCiclo(antes, depois);
  return comFmt({ ...resultado, impactoCiclo, impactoCicloMotivo });
}

/** Único ponto que decide o HTTP de um erro — usado pelos dois tipos de rota. */
function respostaDeErro(erro: unknown): Response {
  const { status, corpo }: ErroApiMapeado = mapearErroApi(erro);
  if (status === 500) {
    console.error('[agent-api] erro interno não mapeado:', erro);
  }

  const resposta = NextResponse.json(corpo, { status });
  if (status === 429) {
    const detalhes = corpo.error.details as { retryAfterSegundos?: number } | undefined;
    if (detalhes?.retryAfterSegundos) {
      resposta.headers.set('Retry-After', String(detalhes.retryAfterSegundos));
    }
  }
  return resposta;
}

// ─────────────────────────────────────────────────────────────────────────
// rotaAgente — LEITURA
// ─────────────────────────────────────────────────────────────────────────

export interface ContextoLeituraAgente<Q, P> {
  deps: Deps;
  donoId: string;
  tokenId: string;
  escopos: readonly EscopoAgente[];
  query: Q;
  params: P;
  req: Request;
}

export interface ConfigRotaAgente<Q, P> {
  escopo: EscopoAgente;
  query?: ZodType<Q>;
  params?: ZodType<P>;
}

/**
 * Rota de LEITURA. O handler devolve os dados crus (objeto ou array) — a
 * formatação de dinheiro (`comFmt`) e o envelope HTTP são responsabilidade
 * desta função, nunca da rota.
 */
export function rotaAgente<Q = undefined, P = undefined>(
  config: ConfigRotaAgente<Q, P>,
  handler: (ctx: ContextoLeituraAgente<Q, P>) => Promise<unknown>,
): HandlerDeRota {
  return async (req, segundo) => {
    try {
      const auth = await autenticarERatelimitar(req, config.escopo);

      const query = config.query
        ? config.query.parse(objetoDaQuery(new URL(req.url)))
        : (undefined as Q);
      const paramsBruto = await segundo.params;
      const params = config.params ? config.params.parse(paramsBruto) : (undefined as P);

      const deps = await criarDepsAgente(auth.donoId, prisma);
      const dados = await handler({ deps, query, params, req, ...auth });

      return NextResponse.json(comFmt(dados), { status: 200 });
    } catch (erro) {
      return respostaDeErro(erro);
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────
// rotaEscrita — ESCRITA ATÔMICA (transação + dryRun + auditoria + impacto)
// ─────────────────────────────────────────────────────────────────────────

export interface AuditarEntrada {
  /** Default: `config.entidade` da rota. Só precisa ser passado quando o handler toca mais de uma entidade. */
  entidade?: string;
  entidadeId?: string | null;
  /** Default: `config.acao` da rota. */
  acao?: AcaoAuditoriaAgente;
  antes?: unknown;
  depois?: unknown;
}
export type AuditarFn = (entrada: AuditarEntrada) => void;

export interface ContextoEscritaAgente<B, Q, P> {
  deps: Deps;
  donoId: string;
  tokenId: string;
  escopos: readonly EscopoAgente[];
  body: B;
  query: Q;
  params: P;
  /** `true` quando a requisição trouxe `?dryRun=true` — a escrita vai ser revertida ao final. */
  dryRun: boolean;
  req: Request;
  auditar: AuditarFn;
}

export interface ConfigRotaEscrita<B, Q, P> {
  escopo: EscopoAgente;
  body?: ZodType<B>;
  query?: ZodType<Q>;
  params?: ZodType<P>;
  /** Default de `auditar()` quando o handler não especifica `entidade`. */
  entidade: string;
  /** Default de `auditar()` quando o handler não especifica `acao`. */
  acao: AcaoAuditoriaAgente;
  /** Status HTTP da resposta quando a escrita é real (não `dryRun`). Default 200; rotas de criação costumam usar 201. */
  status?: number;
}

interface AuditoriaColetada {
  entidade: string;
  entidadeId: string | null;
  acao: AcaoAuditoriaAgente;
  antes: unknown;
  depois: unknown;
}

/** Entrada default quando o handler não chamou `auditar` nenhuma vez — toda escrita deixa rastro. */
function auditoriasFinais(
  coletadas: readonly AuditoriaColetada[],
  config: { entidade: string; acao: AcaoAuditoriaAgente },
): readonly AuditoriaColetada[] {
  if (coletadas.length > 0) return coletadas;
  return [{ entidade: config.entidade, entidadeId: null, acao: config.acao, antes: undefined, depois: undefined }];
}

/**
 * Rota de ESCRITA. Toda a operação roda dentro de UMA transação interativa:
 *
 *  - `?dryRun=true` -> a transação é revertida de propósito ao final
 *    (`executarComPossivelDryRun`) e a resposta vem como
 *    `{ dryRun: true, ...resultado }`; a auditoria é gravada DEPOIS do
 *    rollback, com `dryRun: true`, para o dono ver o que foi simulado.
 *  - escrita real -> a auditoria é gravada DENTRO da mesma transação, então
 *    ela só existe se a escrita de fato comitou.
 *
 * `impactoCiclo` (verba livre e ritmo diário, antes/depois) é medido usando
 * os MESMOS read-models da tela Hoje/painel (`impacto-ciclo.ts`) e anexado a
 * toda resposta, real ou dry-run.
 */
export function rotaEscrita<B = undefined, Q = undefined, P = undefined>(
  config: ConfigRotaEscrita<B, Q, P>,
  handler: (ctx: ContextoEscritaAgente<B, Q, P>) => Promise<Record<string, unknown>>,
): HandlerDeRota {
  return async (req, segundo) => {
    let corpoTextoLido = '';
    try {
      const auth = await autenticarERatelimitar(req, config.escopo);

      const url = new URL(req.url);
      const dryRun = url.searchParams.get('dryRun') === 'true';
      const rota = url.pathname;
      const metodo = req.method;

      const corpoTexto = await req.text();
      corpoTextoLido = corpoTexto;
      const corpoJson: unknown = corpoTexto.trim() === '' ? {} : JSON.parse(corpoTexto);
      const body = config.body ? config.body.parse(corpoJson) : (undefined as B);
      const query = config.query ? config.query.parse(objetoDaQuery(url)) : (undefined as Q);
      const paramsBruto = await segundo.params;
      const params = config.params ? config.params.parse(paramsBruto) : (undefined as P);

      const chaveIdempotencia = req.headers.get('idempotency-key');

      // Idempotência só protege escrita de VERDADE: um dryRun não grava
      // nada, então não existe "mesmo efeito" a reaproveitar.
      if (chaveIdempotencia && !dryRun) {
        const depsLeitura = await criarDepsAgente(auth.donoId, prisma);
        const replay = await verificarIdempotencia(depsLeitura.idempotencia, chaveIdempotencia, corpoTexto);
        if (replay) {
          const resposta = NextResponse.json(replay.resposta, { status: replay.statusHttp });
          resposta.headers.set('Idempotent-Replayed', 'true');
          return resposta;
        }
      }

      const auditorias: AuditoriaColetada[] = [];
      const auditar: AuditarFn = (entrada) => {
        auditorias.push({
          entidade: entrada.entidade ?? config.entidade,
          entidadeId: entrada.entidadeId ?? null,
          acao: entrada.acao ?? config.acao,
          antes: entrada.antes,
          depois: entrada.depois,
        });
      };

      let corpoFinal: unknown = null;
      let impactoAntes: Awaited<ReturnType<typeof snapshotImpactoCiclo>> = null;
      let impactoDepois: Awaited<ReturnType<typeof snapshotImpactoCiclo>> = null;

      await executarComPossivelDryRun<
        Record<string, unknown>,
        Prisma.TransactionClient
      >({
        dryRun,
        transacionar: (fn, opcoes) => prisma.$transaction(fn, opcoes),
        executar: async (tx) => {
          const deps = await criarDepsAgente(auth.donoId, clienteEmTransacao(tx));
          impactoAntes = await snapshotImpactoCiclo(deps);

          const resultado = await handler({
            deps,
            donoId: auth.donoId,
            tokenId: auth.tokenId,
            escopos: auth.escopos,
            body,
            query,
            params,
            dryRun,
            req,
            auditar,
          });

          impactoDepois = await snapshotImpactoCiclo(deps);
          corpoFinal = montarCorpo(resultado, impactoAntes, impactoDepois);

          // Só grava AQUI (dentro da tx) quando é escrita real — num dryRun
          // isto seria revertido pelo sentinel de qualquer jeito, e a
          // gravação de verdade acontece DEPOIS do rollback, mais abaixo.
          if (!dryRun) {
            for (const entrada of auditoriasFinais(auditorias, config)) {
              await deps.auditoria.registrar({
                tokenId: auth.tokenId,
                metodo,
                rota,
                dryRun: false,
                ...entrada,
              });
            }
            // Salva a chave DENTRO da tx: dois retries concorrentes colidem na
            // unicidade (donoId, chave) e o segundo é revertido inteiro, em vez
            // de gravar a escrita duas vezes.
            if (chaveIdempotencia) {
              await salvarIdempotencia(
                deps.idempotencia,
                {
                  tokenId: auth.tokenId,
                  metodo,
                  rota,
                  chave: chaveIdempotencia,
                  corpoTexto,
                  statusHttp: config.status ?? 200,
                  resposta: corpoFinal,
                },
                new Date(),
              );
            }
          }

          return resultado;
        },
      });

      if (dryRun) {
        const depsRaiz = await criarDepsAgente(auth.donoId, prisma);
        for (const entrada of auditoriasFinais(auditorias, config)) {
          await depsRaiz.auditoria.registrar({
            tokenId: auth.tokenId,
            metodo,
            rota,
            dryRun: true,
            ...entrada,
          });
        }
      }

      const corpoFormatado = dryRun ? { dryRun: true, ...(corpoFinal as object) } : corpoFinal;
      const statusHttp = dryRun ? 200 : config.status ?? 200;

      return NextResponse.json(corpoFormatado, { status: statusHttp });
    } catch (erro) {
      // Perdeu a corrida para um retry concorrente com a mesma chave: a tx
      // dele comitou, a nossa foi revertida. Responde com o replay dele.
      const chave = req.headers.get('idempotency-key');
      if (chave && ehViolacaoDeUnicidade(erro)) {
        try {
          const auth = await autenticarAgente(req, config.escopo, PORTAS_AUTENTICACAO);
          const deps = await criarDepsAgente(auth.donoId, prisma);
          const replay = await verificarIdempotencia(deps.idempotencia, chave, corpoTextoLido);
          if (replay) {
            const resposta = NextResponse.json(replay.resposta, { status: replay.statusHttp });
            resposta.headers.set('Idempotent-Replayed', 'true');
            return resposta;
          }
        } catch (erroReplay) {
          return respostaDeErro(erroReplay);
        }
      }
      return respostaDeErro(erro);
    }
  };
}
