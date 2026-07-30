/**
 * Dependências dos casos de uso (injeção). Cada serviço da camada de aplicação
 * recebe este bag de portas — nunca instancia Prisma nem conhece a
 * infraestrutura. A montagem concreta vive em src/composition.ts.
 */
import type { RelogioPort } from '@/domain/ports/relogio';
import type {
  ConfigRepository,
  ContaRepository,
  CategoriaRepository,
  CustoFixoRepository,
  ProvisaoRepository,
  TransacaoRepository,
  ParcelamentoRepository,
  CicloRepository,
  PatrimonioRepository,
} from '@/domain/ports/repositorios';

export interface Deps {
  relogio: RelogioPort;
  config: ConfigRepository;
  contas: ContaRepository;
  categorias: CategoriaRepository;
  custosFixos: CustoFixoRepository;
  provisoes: ProvisaoRepository;
  transacoes: TransacaoRepository;
  parcelamentos: ParcelamentoRepository;
  ciclos: CicloRepository;
  patrimonio: PatrimonioRepository;
}
