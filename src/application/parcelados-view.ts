/**
 * Read-model de `/custos/parcelados` (TASKS-CUSTOS Fase 8). Só orquestração:
 * nenhum cálculo novo mora aqui (CLAUDE.md regra 4). Os agregados por compra
 * vêm de `listarParcelamentos`, derivados das `Transacao` reais.
 *
 * O que esta camada acrescenta é APRESENTAÇÃO que só o servidor sabe montar:
 * o nome da categoria (a tela tem o id, não o nome) e as opções do formulário
 * de edição. Nada disso é derivável no cliente sem uma segunda fonte de
 * verdade.
 */
import type { Deps } from './deps';
import type { DataCivil } from '@/shared/data';
import type { OpcaoCategoria } from './dashboard-tipos';
import { listarParcelamentos, type ParcelamentoResumo } from './parcelamentos';

export interface LinhaParcelamentoGestao {
  resumo: ParcelamentoResumo;
  /** `null` quando a compra não tem categoria — estado aceito pelo cadastro. */
  categoriaNome: string | null;
}

export interface EstadoParcelados {
  linhas: readonly LinhaParcelamentoGestao[];
  /**
   * Categorias oferecidas na edição, VARIAVEL primeiro. Parcela precisa
   * continuar consumindo o teto diário (D-11), e o caso de uso recusa grupo
   * diferente — oferecer aqui uma categoria que o servidor vai recusar seria
   * a mesma classe de defeito do botão "excluir" impossível do §4.1.
   */
  categorias: readonly OpcaoCategoria[];
  /** "Hoje" civil do servidor, para o campo de data do modal. Nunca `new Date()` no cliente. */
  hoje: DataCivil;
}

export async function obterEstadoParcelados(deps: Deps): Promise<EstadoParcelados> {
  const [resumos, categorias] = await Promise.all([
    listarParcelamentos(deps),
    deps.categorias.listar(),
  ]);

  const nomePorId = new Map(categorias.map((c) => [c.id, c.nome]));

  return {
    linhas: resumos.map((resumo) => ({
      resumo,
      categoriaNome: resumo.categoriaId ? (nomePorId.get(resumo.categoriaId) ?? null) : null,
    })),
    categorias: categorias
      .filter((c) => c.grupo === 'VARIAVEL')
      .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((c) => ({ id: c.id, nome: c.nome, grupo: c.grupo })),
    hoje: deps.relogio.hoje(),
  };
}
