/**
 * Testes de `listarAuditoriaAgente`. Fake local (não o de
 * `__fakes__/fakes-ciclo-fechamento.ts`, que não é meu e não filtra por
 * `dryRun`) só para provar: (1) OWNER-only, (2) o filtro chega intacto ao
 * port — nenhuma lógica própria de filtragem mora neste caso de uso.
 */
import { describe, expect, it } from 'vitest';
import { criarDeps as criarDepsFake, ATOR_VIEWER } from './__fakes__/fakes-ciclo-fechamento';
import { AcessoNegadoError } from '@/domain/auth/permissoes';
import type {
  AuditoriaAgentePort,
  FiltroAuditoriaAgente,
  PaginaAuditoriaAgente,
} from '@/domain/ports/auditoria';
import type { Deps } from './deps';
import { listarAuditoriaAgente } from './auditoria';

class FakeAuditoriaPort implements AuditoriaAgentePort {
  ultimoFiltro: FiltroAuditoriaAgente | null = null;
  private readonly pagina: PaginaAuditoriaAgente = { itens: [], proximoCursor: null };

  async registrar(): Promise<void> {
    throw new Error('não usado neste teste');
  }

  async listar(filtro: FiltroAuditoriaAgente): Promise<PaginaAuditoriaAgente> {
    this.ultimoFiltro = filtro;
    return this.pagina;
  }
}

describe('listarAuditoriaAgente', () => {
  it('encaminha o filtro intacto para o port', async () => {
    const d: Deps = criarDepsFake();
    const fake = new FakeAuditoriaPort();
    d.auditoria = fake;

    const filtro: FiltroAuditoriaAgente = { entidade: 'Transacao', dryRun: false, limite: 50 };
    const resultado = await listarAuditoriaAgente(d, filtro);

    expect(fake.ultimoFiltro).toEqual(filtro);
    expect(resultado).toEqual({ itens: [], proximoCursor: null });
  });

  it('VIEWER não pode ler a auditoria', async () => {
    const d: Deps = criarDepsFake({ ator: ATOR_VIEWER });
    d.auditoria = new FakeAuditoriaPort();

    await expect(listarAuditoriaAgente(d, { limite: 50 })).rejects.toThrow(AcessoNegadoError);
  });
});
