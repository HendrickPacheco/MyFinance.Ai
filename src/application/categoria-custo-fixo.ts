/**
 * Guarda de categoria de CUSTO FIXO (fase G0 do TASKS-GRAFO §6).
 *
 * Existe por duas razões que não podem ser resolvidas pela FK do banco:
 *
 *  1. **Nenhuma aresta cruza donos** (TASKS-GRAFO §7.2). `CustoFixo.categoriaId`
 *     agora é uma FK, mas o Postgres aceitaria de bom grado ligar o custo do
 *     dono A à categoria do dono B — a FK só confere que o id EXISTE. Quem
 *     garante o dono é `deps.categorias.obter`, que já nasce escopado em
 *     `donoId` (ver `composition.ts`): id alheio devolve `null`, e daí em
 *     diante é indistinguível de id inexistente. É de propósito — a mensagem
 *     não pode revelar que o id existe na conta de outra pessoa.
 *
 *  2. **O select da tela e o servidor precisam concordar.** A tela oferece
 *     `GRUPOS_DE_CATEGORIA_DE_CUSTO_FIXO`; se o servidor aceitasse mais que
 *     isso, um id montado à mão entraria por um caminho que a UI nunca mostra.
 *
 * Espelha `categoria-parcela.ts` na forma, não na regra: lá o grupo aceito é
 * só VARIAVEL, por causa da D-11 (parcela precisa continuar consumindo teto).
 * Aqui a restrição é mais fraca de propósito — ver o comentário da constante.
 */
import type { Deps } from './deps';
import type { GrupoCategoria } from '@/domain/model/enums';

/**
 * Grupos que um custo fixo pode receber.
 *
 * FIXO é o grupo natural, e vem primeiro no select. VARIAVEL entra junto por
 * um motivo prático: o cadastro base (`CATEGORIAS_BASE`) não semeia nenhuma
 * categoria FIXO, então restringir a FIXO deixaria o select vazio para todo
 * usuário existente — o campo nasceria inútil, que é exatamente o que a G0
 * quer evitar.
 *
 * RENDA fica de fora: um custo fixo é sempre saída de dinheiro, e classificá-lo
 * como entrada só produziria um bloco de "para onde vai a renda" que não fecha.
 */
export const GRUPOS_DE_CATEGORIA_DE_CUSTO_FIXO: readonly GrupoCategoria[] = ['FIXO', 'VARIAVEL'];

/**
 * Lançado ao atribuir a um custo fixo uma categoria de grupo RENDA. Nomeada
 * (em vez de `Error` cru) porque a tela mostra a mensagem literal ao dono.
 */
export class CategoriaInvalidaParaCustoFixoError extends Error {
  constructor(
    public readonly nomeCategoria: string,
    public readonly grupo: string,
  ) {
    super(
      `Categoria "${nomeCategoria}" é do grupo ${grupo} — custo fixo é saída de ` +
        'dinheiro e só aceita categoria de despesa.',
    );
    this.name = 'CategoriaInvalidaParaCustoFixoError';
  }
}

/**
 * `null` é estado legítimo e o padrão: todo custo cadastrado antes da G0 nasceu
 * sem categoria, e continuar sem ela nunca impede salvar.
 *
 * Recebe `Pick<Deps, 'categorias'>` e não `Deps` inteiro porque é só disso que
 * ele depende — e é o que permite `pnpm verificar:isolamento` chamá-lo contra o
 * Postgres real, com um repositório de cada dono, sem montar uma sessão HTTP.
 *
 * @throws Error quando o id não pertence ao dono da sessão (ou não existe).
 * @throws CategoriaInvalidaParaCustoFixoError quando o grupo não é aceito.
 */
export async function validarCategoriaDeCustoFixo(
  deps: Pick<Deps, 'categorias'>,
  categoriaId: string | null,
): Promise<void> {
  if (categoriaId == null) return;

  const categoria = await deps.categorias.obter(categoriaId);
  if (!categoria) throw new Error('Categoria não encontrada.');
  if (!GRUPOS_DE_CATEGORIA_DE_CUSTO_FIXO.includes(categoria.grupo)) {
    throw new CategoriaInvalidaParaCustoFixoError(categoria.nome, categoria.grupo);
  }
}
