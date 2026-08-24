/**
 * `para_onde_vai_a_renda` — o CAMINHO REAL até o dono (§12.2.1, D-15).
 *
 * O teste de rótulos que existia varria `ROTULO_BLOCO`/`ROTULO_SUBDIVISAO`,
 * constantes literais no arquivo ao lado: ele provava que duas constantes não
 * contêm a palavra "verbaVariavel", e nada mais. Nenhum caminho que chega ao
 * usuário estava coberto — e havia vazamento justamente ali, na saída da
 * ferramenta, onde `composicaoDaVerba` (D-15) fala a língua do motor doze
 * linhas abaixo de `rotulosParaODono` mandar não falar.
 *
 * A resposta não é remover `composicaoDaVerba`: foi ela que impediu o copiloto
 * de negar ao dono que a meta de poupança já estava descontada. É marcar aquele
 * vocabulário como INTERNO dentro do próprio payload, e é isso que se testa
 * aqui — junto do que o dono efetivamente lê.
 */
import { describe, expect, it } from 'vitest';
import { criarDeps, cicloFake, transacaoFake } from '@/application/__fakes__/fakes-ciclo-fechamento';
import { ROTULO_BLOCO, ROTULO_SUBDIVISAO } from '@/domain/finance';
import { paraOndeVaiARenda } from './renda';

const HOJE = '2026-07-20';

function deps() {
  return criarDeps({
    hoje: HOJE,
    ciclos: [cicloFake({ id: 'ciclo-atual', dataInicio: '2026-07-05', dataFim: '2026-08-04' })],
    transacoes: [
      transacaoFake({ id: 't1', data: '2026-07-10', valorCents: 12_000, cicloId: 'ciclo-atual' }),
      transacaoFake({
        id: 'p1',
        data: '2026-07-15',
        valorCents: 50_000,
        cicloId: 'ciclo-atual',
        parcelamentoId: 'pc-1',
        parcelaNum: 1,
      }),
    ],
  });
}

/** Todo texto exibível da saída, achatado — inclui os rótulos aninhados. */
function textosDaSaida(valor: unknown): string[] {
  if (typeof valor === 'string') return [valor];
  if (Array.isArray(valor)) return valor.flatMap(textosDaSaida);
  if (typeof valor !== 'object' || valor === null) return [];
  return Object.values(valor as Record<string, unknown>).flatMap(textosDaSaida);
}

describe('para_onde_vai_a_renda — os rótulos que chegam ao dono (§12.2.1)', () => {
  it('usa os rótulos do dono nos blocos e nas subdivisões, e não os nomes do motor', async () => {
    const saida = await paraOndeVaiARenda(deps(), { limite: null });

    const blocos = saida.blocosDeTopo as { rotulo: string }[];
    const subdivisoes = (saida.disponivelParaGastar as { subdivisoes: { rotulo: string }[] })
      .subdivisoes;
    const rotulosExibiveis = [
      ...blocos.map((b) => b.rotulo),
      ...subdivisoes.map((s) => s.rotulo),
    ];

    expect(rotulosExibiveis).toContain(ROTULO_BLOCO.DISPONIVEL_PARA_GASTAR);
    expect(rotulosExibiveis).toContain(ROTULO_SUBDIVISAO.GASTOS_EVENTUAIS_DO_MES);
    expect(rotulosExibiveis).toContain(ROTULO_SUBDIVISAO.PARCELAMENTOS_DO_CICLO);
    for (const rotulo of rotulosExibiveis) {
      expect(rotulo).not.toMatch(/verbaVariavel|verbaLivre/i);
    }
  });

  it('nomeia a puxada da reserva pelo rótulo do dono, sem o termo do motor', async () => {
    const saida = await paraOndeVaiARenda(deps(), { limite: null });
    const blocos = saida.blocosDeTopo as { chave: string; rotulo: string }[];

    expect(blocos.find((b) => b.chave === 'PUXADA_DA_RESERVA')?.rotulo).toBe(
      ROTULO_BLOCO.PUXADA_DA_RESERVA,
    );
  });

  it('marca o vocabulário do motor como INTERNO em vez de deixá-lo contradizer rotulosParaODono', async () => {
    const saida = await paraOndeVaiARenda(deps(), { limite: null });

    // `composicaoDaVerba` continua na saída — é a guarda da D-15, não sai.
    expect(saida.composicaoDaVerba).toBeDefined();
    // ...mas a saída agora diz, em texto, que aqueles nomes são de auditoria.
    const aviso = saida.avisoDeVocabularioInterno as string;
    expect(aviso).toMatch(/auditoria/i);
    expect(aviso).toMatch(/rotulosParaODono/);
  });

  it('os nomes do motor só aparecem onde a saída avisa que são internos', async () => {
    const saida = await paraOndeVaiARenda(deps(), { limite: null });
    const { composicaoDaVerba, rotulosParaODono, avisoDeVocabularioInterno, ...resto } = saida;

    // O resto da saída — tudo que o modelo pode citar sem tradução — está limpo.
    for (const texto of textosDaSaida(resto)) {
      expect(texto).not.toMatch(/verbaVariavel|verbaLivre/i);
    }
    expect(composicaoDaVerba).toBeDefined();
    expect(rotulosParaODono).toBeDefined();
    expect(avisoDeVocabularioInterno).toBeDefined();
  });
});
