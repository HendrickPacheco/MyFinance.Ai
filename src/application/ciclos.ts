/**
 * Casos de uso de ciclo (SPEC 5.2, 5.3, 8 e regra 10). O ciclo é criado com
 * parâmetros CONGELADOS a partir da Config vigente; editar Config depois só
 * afeta o próximo ciclo. Recalcular é uma ação explícita.
 */
import type { Deps } from './deps';
import { exigirEscrita } from '@/domain/auth/permissoes';
import type { Ciclo } from '@/domain/model/entidades';
import type { DestinoSobra } from '@/domain/model/enums';
import { addDias, type DataCivil } from '@/shared/data';
import {
  limitesCiclo,
  provisaoMensalCents,
  poupancaAlvoCents,
  verbaVariavelCents,
} from '@/domain/finance';

/**
 * A sobra de um ciclo fechado só pode ser creditada UMA vez (regra 10 — o
 * usuário pode pular o fechamento de um ciclo; se isso acontecer, o ciclo
 * seguinte já nasceu SEM herdar aquela sobra, e um ciclo mais à frente não
 * pode herdá-la de novo). Só credita quando o ciclo fechado termina
 * exatamente na véspera do ciclo que está nascendo — ou seja, quando ele é
 * o antecessor DIRETO, não um fechamento antigo que já foi pulado.
 */
function rolloverACreditar(
  cicloFechadoAnterior: Ciclo | null,
  destinoSobra: DestinoSobra,
  inicioNovoCiclo: DataCivil,
): number {
  if (destinoSobra !== 'ROLLOVER' || cicloFechadoAnterior?.sobraCents == null) {
    return 0;
  }
  const antecedeDiretamente = addDias(cicloFechadoAnterior.dataFim, 1) === inicioNovoCiclo;
  return antecedeDiretamente ? cicloFechadoAnterior.sobraCents : 0;
}

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
 *
 * >>> EXCEÇÃO DE AUTORIZAÇÃO, DELIBERADA E ÚNICA (TASKS-AUTH §7, S2.2) <<<
 * Esta função ESCREVE (cria o ciclo) e mesmo assim NÃO chama `exigirEscrita`.
 * Motivo: ela roda no `app/layout.tsx` e nos caminhos de LEITURA (hoje,
 * dashboard, ciclo). Travá-la por papel deixaria um VIEWER sem conseguir abrir
 * nenhuma tela — a criação idempotente do ciclo é manutenção do sistema, com
 * autoridade do sistema, não uma escrita solicitada pelo usuário.
 *
 * O que a torna segura como exceção: ela não aceita nenhum dado do cliente
 * (só `deps`), é idempotente, e o que grava é 100% derivado da Config vigente.
 * Não há input para um VIEWER manipular.
 *
 * NÃO use este argumento para afrouxar nenhuma outra escrita.
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
      const rollover = rolloverACreditar(anterior, config.destinoSobra, inicio);

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

      // `criarSeAusente` é a barreira de atomicidade real: se outra chamada
      // concorrente também passou pelo `obterPorInicio` acima antes de
      // qualquer uma inserir (corrida clássica de "duplo render"), a
      // constraint única de `Ciclo.dataInicio` garante que só uma insere —
      // as demais recebem de volta o ciclo do vencedor em vez de duplicá-lo.
      const resultado = await deps.ciclos.criarSeAusente({
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
      ciclo = resultado.ciclo;

      // Só quem efetivamente inseriu vincula as parcelas/lançamentos órfãos
      // — evita rodar o vínculo mais de uma vez para o mesmo ciclo quando
      // várias chamadas concorrentes disputaram a criação.
      if (resultado.criado) {
        await deps.transacoes.vincularCicloPorData(ciclo.id, inicio, fim);
      }
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
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  exigirEscrita(deps.ator);

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
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  exigirEscrita(deps.ator);

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
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  exigirEscrita(deps.ator);

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
      pagoEm: null,
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
