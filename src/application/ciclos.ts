/**
 * Casos de uso de ciclo (SPEC 5.2, 5.3, 8 e regra 10). O ciclo é criado com
 * parâmetros CONGELADOS a partir da Config vigente; editar Config depois só
 * afeta o próximo ciclo. Recalcular é uma ação explícita.
 */
import type { Deps } from './deps';
import type { Ciclo } from '@/domain/model/entidades';
import { addDias } from '@/shared/data';
import {
  limitesCiclo,
  provisaoMensalCents,
  poupancaAlvoCents,
  verbaVariavelCents,
} from '@/domain/finance';

export class ConfigAusenteError extends Error {
  constructor() {
    super('Configuração não encontrada. Preencha renda e dia de recebimento.');
    this.name = 'ConfigAusenteError';
  }
}

/** Soma congelada de fixos ativos + provisão mensal + poupança-alvo do momento. */
async function parametrosCongelados(deps: Deps, rendaPrevistaCents: number) {
  const [custos, provisoes, config] = await Promise.all([
    deps.custosFixos.listarAtivos(),
    deps.provisoes.listarAtivas(),
    deps.config.obter(),
  ]);
  if (!config) throw new ConfigAusenteError();

  const fixosCents = custos.reduce((s, c) => s + c.valorCents, 0);
  const provMensalCents = provisaoMensalCents(provisoes.map((p) => p.valorAnualCents));
  const poupancaCents = poupancaAlvoCents({
    rendaPrevistaCents,
    metaPoupancaCents: config.metaPoupancaCents,
    metaPoupancaPercent: config.metaPoupancaPercent,
  });

  return { fixosCents, provMensalCents, poupancaCents };
}

/**
 * Idempotente (chamada no layout). Garante que existe um ciclo cobrindo hoje;
 * se não existe, cria congelando os parâmetros vigentes. Nunca bloqueia nada
 * por pendência de fechamento (regra 10). Devolve o ciclo atual e se há
 * pendência de fechamento de um ciclo anterior.
 */
export async function garantirCicloAtual(
  deps: Deps,
): Promise<{ ciclo: Ciclo; pendenciaFechamento: Ciclo | null }> {
  const config = await deps.config.obter();
  if (!config) throw new ConfigAusenteError();

  const hoje = deps.relogio.hoje();
  let ciclo = await deps.ciclos.obterAtual(hoje);

  if (!ciclo) {
    const { inicio, fim } = limitesCiclo(hoje, config.diaRecebimento);
    const existente = await deps.ciclos.obterPorInicio(inicio);

    if (existente) {
      ciclo = existente;
    } else {
      const anterior = await deps.ciclos.ultimoFechado();
      const rollover =
        config.destinoSobra === 'ROLLOVER' && anterior?.sobraCents != null
          ? anterior.sobraCents
          : 0;

      const rendaPrevistaCents = config.rendaBaseCents;
      const { fixosCents, provMensalCents, poupancaCents } = await parametrosCongelados(
        deps,
        rendaPrevistaCents,
      );

      const verba = verbaVariavelCents({
        rendaPrevistaCents,
        poupancaAlvoCents: poupancaCents,
        fixosCents,
        provisaoMensalCents: provMensalCents,
        rolloverRecebidoCents: rollover,
      });

      ciclo = await deps.ciclos.criar({
        id: '',
        dataInicio: inicio,
        dataFim: fim,
        rendaPrevistaCents,
        rendaRealizadaCents: null,
        poupancaAlvoCents: poupancaCents,
        fixosCents,
        provisaoMensalCents: provMensalCents,
        verbaVariavelCents: verba,
        rolloverRecebidoCents: rollover,
        fechado: false,
        fechadoEm: null,
        sobraCents: null,
        observacao: null,
      });

      // Puxa parcelas/lançamentos futuros que caíram neste intervalo.
      await deps.transacoes.vincularCicloPorData(ciclo.id, inicio, fim);
    }
  }

  // Pendência: o ciclo anterior (que já terminou) ainda não foi fechado.
  const inicioAnterior = limitesCiclo(addDias(ciclo.dataInicio, -1), config.diaRecebimento).inicio;
  const anterior = await deps.ciclos.obterPorInicio(inicioAnterior);
  const pendenciaFechamento =
    anterior && !anterior.fechado && anterior.id !== ciclo.id ? anterior : null;

  return { ciclo, pendenciaFechamento };
}

/**
 * Recalcula (SPEC 5.2) — ação EXPLÍCITA, com aviso na UI de que o histórico do
 * ciclo atual será alterado. Recongela os parâmetros a partir da Config atual.
 */
export async function recalcularCicloAtual(deps: Deps): Promise<Ciclo> {
  const { ciclo } = await garantirCicloAtual(deps);
  const { fixosCents, provMensalCents, poupancaCents } = await parametrosCongelados(
    deps,
    ciclo.rendaPrevistaCents,
  );
  const verba = verbaVariavelCents({
    rendaPrevistaCents: ciclo.rendaPrevistaCents,
    poupancaAlvoCents: poupancaCents,
    fixosCents,
    provisaoMensalCents: provMensalCents,
    rolloverRecebidoCents: ciclo.rolloverRecebidoCents,
  });

  return deps.ciclos.atualizar(ciclo.id, {
    poupancaAlvoCents: poupancaCents,
    fixosCents,
    provisaoMensalCents: provMensalCents,
    verbaVariavelCents: verba,
  });
}

/**
 * Recalcula o ciclo atual automaticamente SÓ se ele ainda não tem transações.
 * Um ciclo vazio não tem histórico a proteger — então ajustar a Config (ex.:
 * definir a renda no onboarding) pode reconfigurá-lo sem violar o
 * congelamento (SPEC 5.2). Havendo qualquer lançamento, nada muda aqui.
 */
export async function recalcularCicloAtualSeVazio(deps: Deps): Promise<void> {
  const config = await deps.config.obter();
  if (!config) return;

  const ciclo = await deps.ciclos.obterAtual(deps.relogio.hoje());
  if (!ciclo) return;

  const transacoes = await deps.transacoes.listarPorCiclo(ciclo.id);
  if (transacoes.length > 0) return; // tem histórico -> respeita o congelamento

  const rendaPrevistaCents = config.rendaBaseCents;
  const { fixosCents, provMensalCents, poupancaCents } = await parametrosCongelados(
    deps,
    rendaPrevistaCents,
  );
  const verba = verbaVariavelCents({
    rendaPrevistaCents,
    poupancaAlvoCents: poupancaCents,
    fixosCents,
    provisaoMensalCents: provMensalCents,
    rolloverRecebidoCents: ciclo.rolloverRecebidoCents,
  });

  await deps.ciclos.atualizar(ciclo.id, {
    rendaPrevistaCents,
    poupancaAlvoCents: poupancaCents,
    fixosCents,
    provisaoMensalCents: provMensalCents,
    verbaVariavelCents: verba,
  });
}

/**
 * Saída (b) do modo recuperação (SPEC 5.4). Aumenta a verba do ciclo atual em
 * X (reduzindo a poupança-alvo em X só neste ciclo), move X da reserva para a
 * conta variável e registra a decisão na observação do ciclo.
 */
export async function puxarDaReserva(deps: Deps, valorCents: number): Promise<Ciclo> {
  if (!Number.isInteger(valorCents) || valorCents <= 0) {
    throw new Error('Valor a puxar inválido.');
  }
  const { ciclo } = await garantirCicloAtual(deps);

  const contas = await deps.contas.listar({ incluirArquivadas: false });
  const reserva = contas.find((c) => c.tipo === 'RESERVA');
  const variavel = contas.find((c) => c.tipo === 'VARIAVEL');

  if (reserva && variavel) {
    await deps.transacoes.criar({
      id: '',
      data: deps.relogio.hoje(),
      valorCents,
      tipo: 'TRANSFERENCIA',
      descricao: 'Puxada da reserva (modo recuperação)',
      metodo: null,
      categoriaId: null,
      contaId: reserva.id,
      contaDestinoId: variavel.id,
      provisaoId: null,
      parcelamentoId: null,
      parcelaNum: null,
      estornoDeId: null,
      cicloId: ciclo.id,
    });
    await deps.contas.ajustarSaldo(reserva.id, -valorCents);
    await deps.contas.ajustarSaldo(variavel.id, +valorCents);
  }

  const nota = `Puxou ${valorCents} centavos da reserva; poupança reduzida em ${valorCents} neste ciclo.`;
  return deps.ciclos.atualizar(ciclo.id, {
    poupancaAlvoCents: Math.max(ciclo.poupancaAlvoCents - valorCents, 0),
    verbaVariavelCents: ciclo.verbaVariavelCents + valorCents,
    observacao: ciclo.observacao ? `${ciclo.observacao}\n${nota}` : nota,
  });
}
