/**
 * Dependências dos casos de uso (injeção). Cada serviço da camada de aplicação
 * recebe este bag de portas — nunca instancia Prisma nem conhece a
 * infraestrutura. A montagem concreta vive em src/composition.ts.
 */
import type { RelogioPort } from '@/domain/ports/relogio';
import type { ProvedorIAPort } from '@/domain/ports/ia';
import type { Ator } from '@/domain/auth/ator';
import type { SessaoPort } from '@/domain/ports/sessao';
import type { HashSenhaPort } from '@/domain/ports/hash-senha';
import type { RateLimiterPort } from '@/domain/ports/rate-limiter';
import type { UsuarioRepository } from '@/domain/ports/usuarios';
import type { UsoIARepository } from '@/domain/ports/uso-ia';
import type { MemoriaPort } from '@/domain/ports/memoria';
import type { EmbeddingPort } from '@/domain/ports/embeddings';
import type { ConversaPort } from '@/domain/ports/conversa';
import type { ImportacaoRepository } from '@/domain/ports/importacao';
import type {
  ConfigRepository,
  ContaRepository,
  CategoriaRepository,
  CustoFixoRepository,
  PagamentoFixoRepository,
  ProvisaoRepository,
  TransacaoRepository,
  ParcelamentoRepository,
  CicloRepository,
  PatrimonioRepository,
} from '@/domain/ports/repositorios';

export interface Deps {
  /**
   * Quem está fazendo a requisição. OBRIGATÓRIO de propósito: sendo sempre
   * presente (anônimo quando não há sessão), não existe o bug "esqueci de
   * checar se havia ator". Resolvido no servidor a partir da sessão — o
   * cliente NUNCA envia o próprio papel.
   */
  ator: Ator;
  relogio: RelogioPort;
  config: ConfigRepository;
  contas: ContaRepository;
  categorias: CategoriaRepository;
  custosFixos: CustoFixoRepository;
  pagamentosFixos: PagamentoFixoRepository;
  provisoes: ProvisaoRepository;
  transacoes: TransacaoRepository;
  parcelamentos: ParcelamentoRepository;
  ciclos: CicloRepository;
  patrimonio: PatrimonioRepository;
  // ── Identidade e segurança (plano TASKS-AUTH) ──────────────────────────
  usuarios: UsuarioRepository;
  sessoes: SessaoPort;
  hashSenha: HashSenhaPort;
  rateLimiter: RateLimiterPort;
  /**
   * Camada de IA. OPCIONAL de propósito: com `IA_HABILITADA=false` o campo
   * vem `undefined` e o app inteiro funciona exatamente como antes — nenhum
   * caso de uso existente depende dele.
   */
  ia?: ProvedorIAPort;
  /**
   * Contador durável do uso de IA (teto de custo). Opcional pelo mesmo motivo
   * que `ia`: com `IA_HABILITADA=false` nada disso é montado.
   */
  usoIA?: UsoIARepository;
  /**
   * Memória do copiloto (Fase E). Opcional para o app continuar subindo numa
   * instalação sem a extensão pgvector — sem ela o copiloto simplesmente não
   * lembra de nada, em vez de a tela quebrar.
   */
  memorias?: MemoriaPort;
  /**
   * Gerador de embeddings. Separado de `ia` de propósito: com a camada de IA
   * ligada mas sem `OPENAI_MODEL_EMBEDDING`, a memória funciona e só a busca
   * semântica degrada para "mais recentes primeiro".
   */
  embeddings?: EmbeddingPort;
  /**
   * Persistência do histórico do copiloto (Fase 1 do plano de persistência).
   * Não é opcional como `memorias`/`embeddings`: não depende de nenhuma
   * extensão externa (é tabela comum), então toda instalação a tem.
   */
  conversas: ConversaPort;
  /**
   * Persistência do rascunho de importação de fatura (I3 do
   * `TASKS-IMPORTACAO.md`). Não é opcional como `memorias`/`embeddings`: não
   * depende de nenhuma extensão externa, então toda instalação a tem.
   */
  importacoes: ImportacaoRepository;
}
