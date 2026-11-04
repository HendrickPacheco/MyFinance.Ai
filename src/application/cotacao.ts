import { exigirEscrita } from '@/domain/auth/permissoes';
import type { Cotacao } from '@/domain/model/entidades';
import { diffDias, type DataCivil } from '@/shared/data';
import type { Deps } from './deps';

export const IDADE_MAXIMA_CACHE_DIAS = 3; // ponytail: cotação de até 3 dias serve para previsão mensal; refetch diário se precisar

function dataBR(d: DataCivil): string {
  const [a, m, dia] = d.split('-');
  return `${dia}/${m}/${a}`;
}

/** Nunca lança: sem cotação devolve `cotacao: null` + aviso. */
export async function obterCotacaoUsd(
  deps: Deps,
  data: DataCivil = deps.relogio.hoje(),
): Promise<{ cotacao: Cotacao | null; aviso: string | null }> {
  const salva = await deps.cotacoes.ultimaAte(data);
  if (salva && diffDias(data, salva.data) <= IDADE_MAXIMA_CACHE_DIAS) {
    return { cotacao: salva, aviso: null };
  }
  try {
    const nova = await deps.fonteCotacao?.buscarPtaxVenda(data);
    if (nova) return { cotacao: await deps.cotacoes.salvar(nova), aviso: null };
  } catch {
    // cai no fallback abaixo
  }
  if (salva) {
    return {
      cotacao: salva,
      aviso: `Não consegui consultar o Banco Central; usando a cotação de ${dataBR(salva.data)}.`,
    };
  }
  return {
    cotacao: null,
    aviso: 'Sem cotação salva e não consegui consultar o Banco Central. Informe a cotação manualmente.',
  };
}

export async function salvarCotacaoManual(
  deps: Deps,
  data: DataCivil,
  taxaMicros: number,
): Promise<Cotacao> {
  exigirEscrita(deps.ator);
  return deps.cotacoes.salvar({
    data,
    moedaOrigem: 'USD',
    moedaDestino: 'BRL',
    taxaMicros,
    fonte: 'MANUAL',
  });
}
