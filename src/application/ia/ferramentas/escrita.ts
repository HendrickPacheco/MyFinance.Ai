/**
 * Ferramentas de PROPOSTA (decisão D-8) e de memória (Fase E).
 *
 * 🔴 NENHUMA FUNÇÃO DESTE ARQUIVO ESCREVE NO BANCO. Isso não é uma limitação
 * temporária — é o contrato. Ver o cabeçalho de `application/ia/propostas.ts`.
 *
 * Uma "ferramenta de escrita" aqui faz três coisas e para:
 *   1. valida o que o modelo pediu contra o schema da proposta;
 *   2. resolve os ids em nomes legíveis (consulta de LEITURA);
 *   3. devolve a proposta pronta para o loop expor à UI.
 *
 * O que grava é a server action `confirmarProposta`, disparada por um clique
 * do dono, chamando os mesmos casos de uso das telas.
 *
 * A única exceção aparente é `buscar_memoria`, que é leitura pura — e que pode
 * gerar um embedding (custo) já coberto pelo teto avaliado no início do turno.
 */
import type { Deps } from '@/application/deps';
import { buscarMemoria } from '@/application/memoria';
import { validarTextoMemoria } from '@/domain/memoria/regras';
import {
  descreverProposta,
  propostaLancamentoSchema,
  propostaMemoriaSchema,
  propostaParcelamentoSchema,
  type Proposta,
} from '../propostas';
import { dinheiro, erroFerramenta, type SaidaFerramenta } from './saida';

const ORIGEM_PROPOSTA =
  'application/ia/propostas.ts: descreverProposta (nada é gravado até você confirmar)';
const ORIGEM_MEMORIA = 'domain/memoria/regras.ts: validarTextoMemoria';

/**
 * Envelope comum das propostas. `precisaConfirmacao: true` está aqui para o
 * MODELO ler: é o que faz ele narrar "preparei o lançamento, confirme abaixo"
 * em vez de "pronto, lancei" — que seria mentira e a pior falha possível
 * desta fase.
 */
function envelopeProposta(proposta: Proposta, exibivel = descreverProposta(proposta)) {
  return {
    proposta: exibivel,
    precisaConfirmacao: true,
    aviso:
      'NADA foi gravado. Esta é uma proposta que aparece na tela com um botão de confirmar. ' +
      'Diga ao usuário o que você preparou e peça para ele confirmar. Nunca afirme que já foi feito.',
    comoFoiCalculado: ORIGEM_PROPOSTA,
  };
}

/**
 * Catálogo de escolhas para o modelo montar uma proposta. Sem isto ele teria
 * de inventar `categoriaId`, e um id inventado vira lançamento sem categoria
 * silenciosamente.
 *
 * Não devolve saldo de conta: o modelo não precisa dele para propor um gasto,
 * e todo campo monetário a mais é uma chance a mais de o número aparecer numa
 * frase com o rótulo errado.
 */
export async function opcoesDeLancamento(deps: Deps): Promise<SaidaFerramenta> {
  const [categorias, contas] = await Promise.all([
    deps.categorias.listar(),
    deps.contas.listar(),
  ]);

  return {
    categorias: categorias.map((c) => ({
      id: c.id,
      nome: c.nome,
      grupo: c.grupo,
      essencial: c.essencial,
    })),
    contas: contas.map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo })),
    hoje: deps.relogio.hoje(),
    comoFoiCalculado:
      'application/ia/ferramentas/escrita.ts: opcoesDeLancamento (leitura de Categoria e Conta)',
  };
}

/** Nome legível de uma categoria/conta, para o dono conseguir conferir a proposta. */
async function resolverNomes(
  deps: Deps,
  ids: { categoriaId?: string | null; contaId?: string | null },
): Promise<{ categoria: string | null; conta: string | null }> {
  const [categoria, conta] = await Promise.all([
    ids.categoriaId ? deps.categorias.obter(ids.categoriaId) : Promise.resolve(null),
    ids.contaId ? deps.contas.obter(ids.contaId) : Promise.resolve(null),
  ]);
  return { categoria: categoria?.nome ?? null, conta: conta?.nome ?? null };
}

export async function proporLancamento(
  deps: Deps,
  argumentos: unknown,
): Promise<SaidaFerramenta> {
  const validado = propostaLancamentoSchema.safeParse({ ...(argumentos as object), tipo: 'LANCAMENTO' });
  if (!validado.success) {
    return erroFerramenta(`Proposta inválida: ${validado.error.issues.map((i) => i.message).join('; ')}`);
  }
  const proposta = validado.data;

  // Id inexistente é erro do modelo, não um lançamento sem categoria: devolver
  // o erro deixa ele corrigir no turno seguinte.
  if (proposta.categoriaId) {
    const categoria = await deps.categorias.obter(proposta.categoriaId);
    if (!categoria) {
      return erroFerramenta(
        `Categoria "${proposta.categoriaId}" não existe. Chame opcoes_de_lancamento e use um id da lista.`,
      );
    }
  }
  if (proposta.contaId) {
    const conta = await deps.contas.obter(proposta.contaId);
    if (!conta) {
      return erroFerramenta(
        `Conta "${proposta.contaId}" não existe. Chame opcoes_de_lancamento e use um id da lista.`,
      );
    }
  }

  const nomes = await resolverNomes(deps, proposta);
  return {
    ...envelopeProposta(proposta, descreverProposta(proposta, nomes)),
    // Par irmão `Cents`/`Formatado` (convenção da D1): é assim que o modelo
    // cita o valor sem recompor a partir dos centavos.
    ...dinheiro('valor', proposta.valorCents),
  };
}

export async function proporParcelamento(
  deps: Deps,
  argumentos: unknown,
): Promise<SaidaFerramenta> {
  const validado = propostaParcelamentoSchema.safeParse({
    ...(argumentos as object),
    tipo: 'PARCELAMENTO',
  });
  if (!validado.success) {
    return erroFerramenta(`Proposta inválida: ${validado.error.issues.map((i) => i.message).join('; ')}`);
  }
  const proposta = validado.data;

  if (proposta.categoriaId) {
    const categoria = await deps.categorias.obter(proposta.categoriaId);
    if (!categoria) {
      return erroFerramenta(
        `Categoria "${proposta.categoriaId}" não existe. Chame opcoes_de_lancamento e use um id da lista.`,
      );
    }
  }

  const nomes = await resolverNomes(deps, proposta);
  return {
    ...envelopeProposta(proposta, descreverProposta(proposta, nomes)),
    ...dinheiro('valorTotal', proposta.valorTotalCents),
  };
}

/**
 * Propõe guardar uma memória. A guarda pura roda AQUI, no turno da proposta,
 * e não só na confirmação: assim o modelo recebe o motivo da recusa enquanto
 * ainda pode reescrever a frase sem o valor — em vez de o dono clicar em
 * confirmar e só então tomar um erro.
 */
export function proporMemoria(_deps: Deps, argumentos: unknown): Promise<SaidaFerramenta> {
  const validado = propostaMemoriaSchema.safeParse({ ...(argumentos as object), tipo: 'MEMORIA' });
  if (!validado.success) {
    return Promise.resolve(
      erroFerramenta(`Proposta inválida: ${validado.error.issues.map((i) => i.message).join('; ')}`),
    );
  }

  const guarda = validarTextoMemoria(validado.data.texto);
  if (!guarda.ok) {
    return Promise.resolve(
      erroFerramenta(
        `${guarda.motivo} Reescreva a memória sem o número e proponha de novo.`,
      ),
    );
  }

  const proposta = { ...validado.data, texto: guarda.texto };
  return Promise.resolve({
    ...envelopeProposta(proposta),
    comoFoiCalculado: ORIGEM_MEMORIA,
  });
}

/**
 * Busca semântica na memória. Leitura pura: não grava e não propõe.
 *
 * `distancia` sai como NaN quando não houve comparação vetorial (embedding
 * desligado ou teto estourado) — nesse caso a lista é "as mais recentes", e o
 * campo `buscaSemantica` diz isso explicitamente para o modelo não apresentar
 * recência como relevância.
 */
export async function buscarMemoriaFerramenta(
  deps: Deps,
  argumentos: { consulta: string; limite: number | null },
): Promise<SaidaFerramenta> {
  const encontradas = await buscarMemoria(deps, argumentos.consulta, {
    limite: argumentos.limite ?? undefined,
  });

  const houveBuscaSemantica = encontradas.every((m) => Number.isFinite(m.distancia));

  return {
    memorias: encontradas.map((m) => ({
      id: m.id,
      tipo: m.tipo,
      texto: m.texto,
      origem: m.origem,
      ...(Number.isFinite(m.distancia) ? { distancia: m.distancia } : {}),
    })),
    buscaSemantica: encontradas.length > 0 ? houveBuscaSemantica : true,
    observacao: houveBuscaSemantica
      ? null
      : 'A busca semântica não estava disponível: esta lista é das memórias mais recentes, não das mais relevantes.',
    comoFoiCalculado: 'application/memoria.ts: buscarMemoria (pgvector, distância de cosseno)',
  };
}
