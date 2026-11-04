/**
 * Autenticação da API do agente: `Authorization: Bearer <token>` -> hash ->
 * lookup -> estado -> escopo -> ator. Nenhuma noção de cookie/sessão — é a
 * porta de entrada paralela a `SessaoCookie` (`sessao-cookie.ts`), para um
 * cliente que não tem navegador.
 *
 * Recebe as dependências de dados como FUNÇÕES (não repositórios inteiros),
 * de propósito: o único método "sem dono" de `ApiTokenRepository`
 * (`buscarPorHashParaAutenticar`) e o único método que precisa do dono só
 * DEPOIS de descoberto (`marcarUsoAgora`) pedem instâncias construídas com
 * `donoId` diferentes — a assinatura aqui esconde essa costura e fica
 * trivialmente testável com funções fake, sem precisar instanciar nenhum
 * repositório de verdade.
 */
import { createHash } from 'node:crypto';
import { comparaSegura } from '@/infrastructure/auth/sessao-cookie';
import { escopoSatisfaz, estadoToken, type EscopoAgente } from '@/domain/auth/api-token';
import type { ApiTokenRegistro } from '@/domain/ports/api-tokens';
import { ErroApi } from './erros';

export interface AutenticacaoAgente {
  donoId: string;
  tokenId: string;
  escopos: readonly EscopoAgente[];
}

export interface PortasAutenticacaoAgente {
  buscarTokenPorHash: (hash: string) => Promise<ApiTokenRegistro | null>;
  /** Fire-and-forget do ponto de vista de quem chama — ver o `catch` abaixo. */
  marcarTokenUsado: (donoId: string, tokenId: string, usadoEm: Date) => Promise<void>;
  buscarUsuarioAtivo: (donoId: string) => Promise<{ ativo: boolean } | null>;
}

function hashSha256Hex(texto: string): string {
  return createHash('sha256').update(texto).digest('hex');
}

function extrairTokenCru(req: Request): string {
  const cabecalho = req.headers.get('authorization');
  if (!cabecalho) {
    throw new ErroApi(401, 'NAO_AUTENTICADO', 'Cabeçalho "Authorization" ausente.');
  }
  const [esquema, valor] = cabecalho.split(' ');
  if (esquema?.toLowerCase() !== 'bearer' || !valor) {
    throw new ErroApi(401, 'NAO_AUTENTICADO', 'Use "Authorization: Bearer <token>".');
  }
  return valor;
}

/**
 * Autentica a requisição e exige o escopo. Lança `ErroApi`:
 *  - 401 — cabeçalho ausente/malformado, token desconhecido, revogado ou expirado;
 *  - 403 — token válido, mas sem o escopo exigido pela rota.
 */
export async function autenticarAgente(
  req: Request,
  escopoNecessario: EscopoAgente,
  portas: PortasAutenticacaoAgente,
  agora: Date = new Date(),
): Promise<AutenticacaoAgente> {
  const tokenCru = extrairTokenCru(req);
  const hash = hashSha256Hex(tokenCru);

  const registro = await portas.buscarTokenPorHash(hash);
  // Comparação em tempo constante do HASH, mesmo já tendo vindo de um lookup
  // único por índice — defesa em profundidade explícita (não o único ponto
  // de segurança: o índice único do Postgres já impede dois tokens com o
  // mesmo hash existirem).
  if (!registro || !comparaSegura(registro.hash, hash)) {
    throw new ErroApi(401, 'NAO_AUTENTICADO', 'Token inválido.');
  }

  const estado = estadoToken(registro, agora);
  if (estado === 'revogado') {
    throw new ErroApi(401, 'NAO_AUTENTICADO', 'Token revogado.');
  }
  if (estado === 'expirado') {
    throw new ErroApi(401, 'NAO_AUTENTICADO', 'Token expirado.');
  }

  if (!escopoSatisfaz(registro.escopos, escopoNecessario)) {
    throw new ErroApi(
      403,
      'ESCOPO_INSUFICIENTE',
      `Esta operação exige o escopo "${escopoNecessario}".`,
    );
  }

  const usuario = await portas.buscarUsuarioAtivo(registro.donoId);
  if (!usuario || !usuario.ativo) {
    throw new ErroApi(401, 'NAO_AUTENTICADO', 'O usuário deste token não existe mais ou está inativo.');
  }

  // Fire-and-forget: a requisição nunca falha por causa de um registro de
  // telemetria. `void` deixa explícito que o resultado é ignorado de propósito.
  void portas.marcarTokenUsado(registro.donoId, registro.id, agora).catch((erro: unknown) => {
    console.error('[agent-api] falha ao marcar último uso do token:', erro);
  });

  return { donoId: registro.donoId, tokenId: registro.id, escopos: registro.escopos };
}
