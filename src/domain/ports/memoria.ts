/**
 * Porta da memória do copiloto (Fase E, tarefa E3).
 *
 * O domínio não sabe que existe pgvector, nem SQL cru, nem `<=>`. Ele sabe
 * apenas que dá para guardar uma intenção, listar o que já foi guardado e
 * pedir "as memórias mais parecidas com este vetor". Trocar a busca semântica
 * por busca textual amanhã não toca em nenhum caso de uso.
 *
 * O vetor aparece aqui como `readonly number[]` — um array de números, não um
 * tipo do banco. Quem o gera é a `EmbeddingPort`; quem o persiste e compara é
 * o adapter.
 *
 * 🔴 Nenhuma implementação desta porta pode gravar texto que não tenha passado
 * por `validarTextoMemoria` (domain/memoria/regras.ts). A guarda vive no caso
 * de uso, não aqui — mas quem escrever um segundo adapter precisa saber disso.
 */
import type { OrigemMemoria, TipoMemoria } from '@/domain/memoria/regras';

export interface Memoria {
  id: string;
  tipo: TipoMemoria;
  /** Intenção, plano ou preferência. NUNCA valor monetário (§11.2). */
  texto: string;
  origem: OrigemMemoria;
  ativo: boolean;
  criadoEm: Date;
}

export interface MemoriaComRelevancia extends Memoria {
  /**
   * Distância de cosseno devolvida pelo índice: 0 = idêntico, 2 = oposto.
   * Exposta para o caso de uso poder cortar por limiar — e para a UI de
   * auditoria mostrar POR QUE uma memória foi trazida.
   */
  distancia: number;
}

export interface NovaMemoria {
  tipo: TipoMemoria;
  texto: string;
  origem: OrigemMemoria;
  /**
   * `null` quando o embedding falhou ou está desligado. A memória é gravada
   * mesmo assim: a busca semântica deixa de alcançá-la (degrada), mas o dono
   * não perde o que pediu para guardar (não quebra).
   */
  embedding: readonly number[] | null;
}

export interface MemoriaPort {
  criar(nova: NovaMemoria): Promise<Memoria>;

  /** Memórias ativas do dono, mais recentes primeiro. Para o prompt e a auditoria. */
  listar(opcoes?: {
    tipos?: readonly TipoMemoria[];
    incluirArquivadas?: boolean;
    limite?: number;
  }): Promise<Memoria[]>;

  obter(id: string): Promise<Memoria | null>;

  /**
   * Busca semântica: as `limite` memórias ativas mais próximas do vetor.
   * Memórias sem embedding simplesmente não aparecem — não são erro.
   */
  buscarPorEmbedding(
    embedding: readonly number[],
    opcoes?: { limite?: number; tipos?: readonly TipoMemoria[] },
  ): Promise<MemoriaComRelevancia[]>;

  /**
   * Memórias ativas que ainda não têm vetor. Existem por três caminhos:
   * import de backup (o vetor não viaja no arquivo), embedding desligado
   * quando a memória foi criada, e falha do provedor naquele momento.
   */
  listarSemEmbedding(limite?: number): Promise<Memoria[]>;

  /** Grava o vetor de uma memória já existente (reindexação). */
  definirEmbedding(id: string, embedding: readonly number[]): Promise<void>;

  /** Arquivar é o "apagar" do dono: reversível e auditável. */
  arquivar(id: string): Promise<void>;
  reativar(id: string): Promise<void>;

  /** Remoção definitiva — só o import de backup usa, para não duplicar linhas. */
  excluirTodas(): Promise<void>;
}
