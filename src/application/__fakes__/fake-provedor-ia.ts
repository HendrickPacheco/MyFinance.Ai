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
import type { ZodType } from 'zod';
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

/**
 * Um turno programado para `completarComSchema`, em fila PRÓPRIA — separada
 * da fila de `completarComTools`, porque a extração de fatura (I3) nunca
 * mistura os dois caminhos numa mesma conversa.
 */
export type TurnoDeSchemaProgramado =
  | { tipo: 'DADOS'; dados: unknown; consumo?: ConsumoTokens }
  | { tipo: 'ERRO'; motivo: MotivoErroProvedorIA; mensagem?: string };

/** O que o fake viu em cada chamada, para asserção nos testes. */
export interface RegistroChamada {
  mensagens: readonly MensagemIA[];
  ferramentas: readonly DefinicaoFerramenta[];
}

/** O que o fake viu em cada chamada a `completarComSchema`. */
export interface RegistroChamadaDeSchema {
  mensagens: readonly MensagemIA[];
  nomeDoSchema: string;
}

export class FakeProvedorIA implements ProvedorIAPort {
  private readonly fila: TurnoProgramado[];
  private readonly filaSchema: TurnoDeSchemaProgramado[];
  /** Chamadas recebidas, na ordem. */
  readonly chamadas: RegistroChamada[] = [];
  /** Chamadas a `completarComSchema` recebidas, na ordem. */
  readonly chamadasDeSchema: RegistroChamadaDeSchema[] = [];

  constructor(turnos: readonly TurnoProgramado[] = [], turnosDeSchema: readonly TurnoDeSchemaProgramado[] = []) {
    this.fila = [...turnos];
    this.filaSchema = [...turnosDeSchema];
  }

  /** Enfileira mais turnos depois da construção. */
  programar(...turnos: readonly TurnoProgramado[]): this {
    this.fila.push(...turnos);
    return this;
  }

  /** Enfileira mais turnos de `completarComSchema` depois da construção. */
  programarSchema(...turnos: readonly TurnoDeSchemaProgramado[]): this {
    this.filaSchema.push(...turnos);
    return this;
  }

  /** Turnos ainda não consumidos — útil para provar que o loop parou cedo. */
  get turnosRestantes(): number {
    return this.fila.length;
  }

  /** Turnos de `completarComSchema` ainda não consumidos. */
  get turnosDeSchemaRestantes(): number {
    return this.filaSchema.length;
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

  async completarComSchema<T>(entrada: {
    mensagens: readonly MensagemIA[];
    schema: ZodType<T>;
    nomeDoSchema: string;
  }): Promise<{ dados: T; consumo?: ConsumoTokens }> {
    this.chamadasDeSchema.push({
      mensagens: [...entrada.mensagens],
      nomeDoSchema: entrada.nomeDoSchema,
    });

    const turno = this.filaSchema.shift();
    if (!turno) {
      throw new Error(
        `FakeProvedorIA: filaSchema vazia na chamada nº ${this.chamadasDeSchema.length}. ` +
          'Programe mais turnos com programarSchema ou revise o teste.',
      );
    }

    if (turno.tipo === 'ERRO') {
      throw new ErroProvedorIA(
        turno.motivo,
        turno.mensagem ?? `FakeProvedorIA: erro programado (${turno.motivo})`,
      );
    }

    // Ao contrário de `completarComTools`, aqui o fake VALIDA contra o
    // schema recebido — é exatamente esse contrato que a extração (I3)
    // depende para rejeitar saída malformada do modelo, e o teste programa
    // `dados` inválidos de propósito para provar essa rejeição.
    const validado = entrada.schema.safeParse(turno.dados);
    if (!validado.success) {
      throw new ErroProvedorIA(
        'SCHEMA_INVALIDO',
        `FakeProvedorIA: dados programados não batem com o schema "${entrada.nomeDoSchema}": ${validado.error.message}`,
        validado.error,
      );
    }

    return { dados: validado.data, consumo: turno.consumo };
  }
}
