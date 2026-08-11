/**
 * Conciliação razão × realidade na camada de aplicação.
 *
 * Origem (11/08/2026): `Conta.saldoCents` (razão, movido por transação e
 * fechamento) e `ItemPatrimonio.valorCents` (realidade digitada pelo dono)
 * descreviam o mesmo dinheiro sem nada ligando os dois. O saldo ficava
 * defasado em silêncio e `mesesDeReserva` respondia com um número errado —
 * pior que não responder.
 */
import { describe, expect, it } from 'vitest';
import { criarDeps, contaFake, ATOR_OWNER } from './__fakes__/fakes-ciclo-fechamento';
import {
  obterPatrimonio,
  aceitarRealidade,
  criarSnapshot,
  sugestaoItensSnapshot,
} from './patrimonio';
import type { SnapshotPatrimonio } from '@/domain/model/entidades';

function snapshotComVinculo(valorCents: number, contaId: string | null): SnapshotPatrimonio {
  return {
    id: 'snap-1',
    data: '2026-08-01',
    totalCents: valorCents,
    itens: [
      {
        id: 'item-1',
        snapshotId: 'snap-1',
        nome: 'Reserva de Emergência',
        classe: 'RENDA_FIXA',
        valorCents,
        contaId,
      },
    ],
  };
}

function deps(saldoContaCents: number, valorObservadoCents: number, contaId: string | null = 'reserva') {
  return criarDeps({
    hoje: '2026-08-11',
    contas: [contaFake({ id: 'reserva', tipo: 'RESERVA', saldoCents: saldoContaCents })],
    snapshots: [snapshotComVinculo(valorObservadoCents, contaId)],
  });
}

describe('obterPatrimonio — divergências', () => {
  it('acusa a diferença entre o saldo da conta e o valor observado', async () => {
    const estado = await obterPatrimonio(deps(5_500_000, 6_000_000));

    expect(estado.divergencias).toHaveLength(1);
    expect(estado.divergencias[0]).toMatchObject({
      itemId: 'item-1',
      contaId: 'reserva',
      razaoCents: 5_500_000,
      observadoCents: 6_000_000,
      deltaCents: 500_000,
    });
  });

  it('sem divergência quando razão e realidade batem', async () => {
    const estado = await obterPatrimonio(deps(6_000_000, 6_000_000));

    expect(estado.divergencias).toEqual([]);
  });

  it('item sem vínculo não gera divergência, mesmo com saldo diferente', async () => {
    const estado = await obterPatrimonio(deps(0, 6_000_000, null));

    expect(estado.divergencias).toEqual([]);
  });

  it('concilia contra o snapshot mais recente, não contra os antigos', async () => {
    const d = criarDeps({
      hoje: '2026-08-11',
      contas: [contaFake({ id: 'reserva', tipo: 'RESERVA', saldoCents: 6_000_000 })],
      snapshots: [
        // Antigo diverge; recente bate. Divergência velha é história, não pendência.
        { ...snapshotComVinculo(5_000_000, 'reserva'), id: 'snap-velho', data: '2026-07-01' },
        { ...snapshotComVinculo(6_000_000, 'reserva'), id: 'snap-novo', data: '2026-08-01' },
      ],
    });

    const estado = await obterPatrimonio(d);

    expect(estado.divergencias).toEqual([]);
  });
});

describe('aceitarRealidade', () => {
  it('move o saldo da conta até o valor observado e zera a divergência', async () => {
    const d = deps(5_500_000, 6_000_000);

    await aceitarRealidade(d, 'item-1');

    const conta = d.contas.itens.find((c) => c.id === 'reserva');
    expect(conta?.saldoCents).toBe(6_000_000);
    expect((await obterPatrimonio(d)).divergencias).toEqual([]);
  });

  it('funciona quando a realidade é MENOR que o razão (gasto não lançado)', async () => {
    const d = deps(6_000_000, 5_000_000);

    await aceitarRealidade(d, 'item-1');

    expect(d.contas.itens.find((c) => c.id === 'reserva')?.saldoCents).toBe(5_000_000);
  });

  it('não cria transação — a correção não é um gasto e não pode consumir teto', async () => {
    const d = deps(6_000_000, 5_000_000);
    const antes = d.transacoes.itens.length;

    await aceitarRealidade(d, 'item-1');

    expect(d.transacoes.itens).toHaveLength(antes);
  });

  it('item sem conta vinculada é recusado', async () => {
    const d = deps(0, 6_000_000, null);

    await expect(aceitarRealidade(d, 'item-1')).rejects.toThrow();
  });

  it('item inexistente é recusado sem tocar em saldo', async () => {
    const d = deps(5_500_000, 6_000_000);

    await expect(aceitarRealidade(d, 'item-fantasma')).rejects.toThrow();
    expect(d.contas.itens.find((c) => c.id === 'reserva')?.saldoCents).toBe(5_500_000);
  });
});

describe('criarSnapshot — escopo do vínculo (regra de ouro do multi-tenant)', () => {
  it('recusa contaId que não pertence ao dono', async () => {
    const d = criarDeps({
      hoje: '2026-08-11',
      ator: ATOR_OWNER,
      contas: [contaFake({ id: 'minha-conta', tipo: 'RESERVA' })],
    });

    // A FK do Postgres aceitaria este id (a conta existe, é de outro dono);
    // só a validação de escopo no caso de uso barra.
    await expect(
      criarSnapshot(d, '2026-08-11', [
        { nome: 'Reserva alheia', classe: 'CONTA', valorCents: 100, contaId: 'conta-de-outro' },
      ]),
    ).rejects.toThrow();

    expect(d.patrimonio.itens).toHaveLength(0);
  });

  it('aceita contaId do próprio dono e persiste o vínculo', async () => {
    const d = criarDeps({
      hoje: '2026-08-11',
      contas: [contaFake({ id: 'minha-conta', tipo: 'RESERVA' })],
    });

    await criarSnapshot(d, '2026-08-11', [
      { nome: 'Reserva', classe: 'CONTA', valorCents: 100, contaId: 'minha-conta' },
    ]);

    expect(d.patrimonio.itens[0]?.itens[0]?.contaId).toBe('minha-conta');
  });

  /**
   * Regressão (11/08/2026): a segunda gravação na mesma data estourava
   * `@@unique([donoId, data])` e o erro cru do Prisma vazava para a tela, sem
   * nenhum caminho para corrigir uma fotografia digitada errado.
   */
  it('salvar na mesma data substitui o snapshot em vez de estourar a unicidade', async () => {
    const d = criarDeps({
      hoje: '2026-08-11',
      contas: [contaFake({ id: 'minha-conta', tipo: 'RESERVA' })],
    });

    await criarSnapshot(d, '2026-08-11', [
      { nome: 'Reserva', classe: 'CONTA', valorCents: 100 },
    ]);
    await criarSnapshot(d, '2026-08-11', [
      { nome: 'Reserva', classe: 'CONTA', valorCents: 200, contaId: 'minha-conta' },
    ]);

    expect(d.patrimonio.itens).toHaveLength(1);
    expect(d.patrimonio.itens[0]?.totalCents).toBe(200);
    expect(d.patrimonio.itens[0]?.itens[0]?.contaId).toBe('minha-conta');
  });

  it('substituir uma data não toca nos snapshots das outras', async () => {
    const d = criarDeps({ hoje: '2026-08-11', contas: [] });

    await criarSnapshot(d, '2026-07-01', [{ nome: 'X', classe: 'CONTA', valorCents: 111 }]);
    await criarSnapshot(d, '2026-08-11', [{ nome: 'Y', classe: 'CONTA', valorCents: 222 }]);
    await criarSnapshot(d, '2026-08-11', [{ nome: 'Y2', classe: 'CONTA', valorCents: 333 }]);

    const porData = Object.fromEntries(d.patrimonio.itens.map((s) => [s.data, s.totalCents]));
    expect(porData).toEqual({ '2026-07-01': 111, '2026-08-11': 333 });
  });

  /**
   * O vínculo atravessa o fechamento de ciclo. `sugestaoItensSnapshot` alimenta
   * o wizard, que reconstrói os itens antes de submeter — e reconstruir sem
   * `contaId` faria o snapshot do fechamento nascer solto, desligando a
   * conciliação sem erro nenhum.
   */
  it('a sugestão carrega o contaId para o snapshot seguinte', async () => {
    const d = criarDeps({
      hoje: '2026-08-11',
      contas: [contaFake({ id: 'reserva', tipo: 'RESERVA', saldoCents: 100 })],
      snapshots: [snapshotComVinculo(6_000_000, 'reserva')],
    });

    const sugeridos = await sugestaoItensSnapshot(d);

    expect(sugeridos[0]?.contaId).toBe('reserva');
  });

  it('item sem contaId continua válido — nem todo patrimônio tem conta', async () => {
    const d = criarDeps({ hoje: '2026-08-11', contas: [] });

    await criarSnapshot(d, '2026-08-11', [
      { nome: 'Apartamento', classe: 'IMOVEL', valorCents: 50_000_000 },
    ]);

    expect(d.patrimonio.itens[0]?.itens[0]?.contaId).toBeNull();
  });
});
