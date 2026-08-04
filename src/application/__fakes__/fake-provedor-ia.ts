/**
 * Fake de `ProvedorIAPort`, no espírito de `RelogioFixo`: determinístico, sem
 * rede e sem custo. É o que torna o loop do copiloto testável.
 *
 * A conversa é programada como uma FILA de turnos. Cada chamada a
 * `completarComTools` consome o próximo turno — é assim que se programa
 * "turno 1 pede uma ferramenta, turno 2 pede outra, turno 3 fecha com texto".
 *
 * Não valida argumento contra schema de propósito: o fake simula o provedor,
 * inclusive quando ele se comporta mal. Para simular má-validação, programe um
 * turno de erro `SCHEMA_INVALIDO`.
 */
import {
  ErroProvedorIA,
  type ChamadaFerramenta,
  type ConsumoTokens,
  type DefinicaoFerramenta,
  type MensagemIA,
  type MotivoErroProvedorIA,
  type ProvedorIAPort,
  type ResultadoTurno,
} from '@/domain/ports/ia';

/** Uma chamada de ferramenta a programar. O `id` é gerado se omitido. */
export interface ChamadaProgramada {
  nome: string;
  argumentos: unknown;
  id?: string;
}

export type TurnoProgramado =
  | { tipo: 'FERRAMENTAS'; chamadas: readonly ChamadaProgramada[]; consumo?: ConsumoTokens }
  | { tipo: 'TEXTO'; texto: string; consumo?: ConsumoTokens }
  | { tipo: 'ERRO'; motivo: MotivoErroProvedorIA; mensagem?: string };

/** O que o fake viu em cada chamada, para asserção nos testes. */
export interface RegistroChamada {
  mensagens: readonly MensagemIA[];
  ferramentas: readonly DefinicaoFerramenta[];
}

export class FakeProvedorIA implements ProvedorIAPort {
  private readonly fila: TurnoProgramado[];
  /** Chamadas recebidas, na ordem. */
  readonly chamadas: RegistroChamada[] = [];

  constructor(turnos: readonly TurnoProgramado[] = []) {
    this.fila = [...turnos];
  }

  /** Enfileira mais turnos depois da construção. */
  programar(...turnos: readonly TurnoProgramado[]): this {
    this.fila.push(...turnos);
    return this;
  }

  /** Turnos ainda não consumidos — útil para provar que o loop parou cedo. */
  get turnosRestantes(): number {
    return this.fila.length;
  }

  /** Nomes das ferramentas pedidas, achatados na ordem em que foram pedidas. */
  ferramentasPedidas(): string[] {
    return this.chamadas.flatMap((c) =>
      c.mensagens
        .filter((m) => m.papel === 'ferramenta')
        .map((m) => (m.papel === 'ferramenta' ? m.nome : '')),
    );
  }

  async completarComTools(entrada: {
    mensagens: readonly MensagemIA[];
    ferramentas: readonly DefinicaoFerramenta[];
  }): Promise<ResultadoTurno> {
    this.chamadas.push({
      mensagens: [...entrada.mensagens],
      ferramentas: [...entrada.ferramentas],
    });

    const turno = this.fila.shift();
    if (!turno) {
      throw new Error(
        `FakeProvedorIA: fila vazia na chamada nº ${this.chamadas.length}. ` +
          'Programe mais turnos ou revise o teste.',
      );
    }

    if (turno.tipo === 'ERRO') {
      throw new ErroProvedorIA(
        turno.motivo,
        turno.mensagem ?? `FakeProvedorIA: erro programado (${turno.motivo})`,
      );
    }

    if (turno.tipo === 'TEXTO') {
      return { resposta: { tipo: 'TEXTO', texto: turno.texto }, consumo: turno.consumo };
    }

    const chamadas: ChamadaFerramenta[] = turno.chamadas.map((c, i) => ({
      id: c.id ?? `fake-${this.chamadas.length}-${i}`,
      nome: c.nome,
      argumentos: c.argumentos,
    }));

    return { resposta: { tipo: 'FERRAMENTAS', chamadas }, consumo: turno.consumo };
  }
}
