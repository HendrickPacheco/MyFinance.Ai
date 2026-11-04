import type { TipoTransacao, TipoVerba } from '@/domain/model/enums';

export interface VerbaEdicao {
  tipo: TipoTransacao;
  ehParcela: boolean;
  override: TipoVerba | null;
}

export interface CategoriaVerba {
  grupo?: string;
  tipoVerba?: TipoVerba;
}

/** O seletor de verba só existe para DESPESA numa categoria que consome verba. */
export function seletorVerbaVisivel(verba: VerbaEdicao | undefined, cat: CategoriaVerba | undefined): boolean {
  return verba?.tipo === 'DESPESA' && cat?.grupo !== 'FIXO' && !!cat?.tipoVerba;
}

/**
 * Valor de `tipoVerbaOverride` a enviar: sem `verba` não mexe (undefined);
 * seletor escondido pela categoria atual limpa (null) para não deixar override
 * invisível no banco; parcela não envia; senão, a seleção ('' = padrão = null).
 */
export function overrideParaEnviar(
  verba: VerbaEdicao | undefined,
  cat: CategoriaVerba | undefined,
  selecionado: '' | TipoVerba,
): TipoVerba | null | undefined {
  if (!verba) return undefined;
  if (!seletorVerbaVisivel(verba, cat)) return null;
  if (verba.ehParcela) return undefined;
  return selecionado || null;
}
