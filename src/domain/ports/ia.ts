/**
 * Porta do provedor de IA. O domínio não sabe QUAL provedor responde — só que
 * existe algo capaz de, dado um histórico e um catálogo de ferramentas,
 * devolver ou uma lista de chamadas de ferramenta ou um texto final.
 *
 * O modelo é um TRADUTOR entre linguagem e estrutura, nunca uma calculadora:
 * quem sabe quanto é são as funções puras de `src/domain/finance/`. Por isso
 * esta porta não tem nenhuma noção de dinheiro, de data civil ou de cálculo.
 *
 * Nenhum SDK, nenhum nome de modelo e nenhuma variável de ambiente aparecem
 * aqui — isso vive só em `src/infrastructure/ia/`.
 */
import type { ZodType, ZodTypeAny } from 'zod';

/** Uma ferramenta oferecida ao modelo. Os argumentos são schema Zod; traduzir
 * para o formato do provedor (JSON Schema) é responsabilidade do adapter. */
export interface DefinicaoFerramenta {
  /** Identificador estável, em snake_case (ex.: `estado_ciclo`). */
  nome: string;
  /** O que a ferramenta responde, na linguagem do usuário. É isto que o
   * modelo lê para escolher entre ferramentas parecidas. */
  descricao: string;
  /** Schema dos argumentos. Também valida o que o modelo devolve. */
  argumentos: ZodTypeAny;
}

/** Uma chamada de ferramenta pedida pelo modelo, já validada contra o schema. */
export interface ChamadaFerramenta {
  /** Id da chamada, para casar o resultado no turno seguinte. */
  id: string;
  nome: string;
  /** Argumentos já validados pelo schema Zod da ferramenta correspondente. */
  argumentos: unknown;
}

export type MensagemIA =
  | { papel: 'sistema'; conteudo: string }
  | { papel: 'usuario'; conteudo: string }
  | { papel: 'assistente'; conteudo: string; chamadas?: readonly ChamadaFerramenta[] }
  | { papel: 'ferramenta'; idChamada: string; nome: string; conteudo: string };

/**
 * Resultado de um turno. Discriminado de propósito: o chamador nunca precisa
 * adivinhar se o turno pediu ferramenta ou fechou com texto.
 */
export type RespostaProvedorIA =
  | { tipo: 'FERRAMENTAS'; chamadas: readonly ChamadaFerramenta[] }
  | { tipo: 'TEXTO'; texto: string };

export interface ConsumoTokens {
  entrada: number;
  saida: number;
}

export interface ResultadoTurno {
  resposta: RespostaProvedorIA;
  /** Para medir custo por pergunta. Ausente se o provedor não informar. */
  consumo?: ConsumoTokens;
}

export type MotivoErroProvedorIA =
  | 'INDISPONIVEL'
  | 'SCHEMA_INVALIDO'
  | 'LIMITE_EXCEDIDO'
  | 'CONTEUDO_RECUSADO';

/** Erro tipado do provedor. Mesmo padrão de `CicloFechadoError`. */
export class ErroProvedorIA extends Error {
  constructor(
    readonly motivo: MotivoErroProvedorIA,
    mensagem: string,
    readonly causa?: unknown,
  ) {
    super(mensagem);
    this.name = 'ErroProvedorIA';
  }
}

export interface ProvedorIAPort {
  /**
   * Executa UM turno: manda o histórico e o catálogo, recebe ou chamadas de
   * ferramenta ou o texto final. O loop de múltiplos turnos é do caso de uso,
   * não do provedor.
   *
   * Lança `ErroProvedorIA` — nunca deixa vazar erro do SDK.
   */
  completarComTools(entrada: {
    mensagens: readonly MensagemIA[];
    ferramentas: readonly DefinicaoFerramenta[];
  }): Promise<ResultadoTurno>;

  /**
   * Executa UM turno sem ferramenta nenhuma: manda o histórico e um schema
   * Zod, recebe de volta dados já validados contra ELE MESMO. É o caminho da
   * extração de fatura (I3) — o modelo só TRANSCREVE texto em estrutura, e
   * como não há ferramenta no turno, não há nada para uma injeção de
   * conteúdo do documento acionar.
   *
   * Mesma disciplina de `completarComTools`: o schema não pode usar
   * `.optional()` (o adapter gera JSON Schema estrito — ver
   * `infrastructure/ia/esquema-json.ts`), e uma saída que não valida contra
   * `entrada.schema` lança `ErroProvedorIA` com motivo `SCHEMA_INVALIDO`.
   *
   * Lança `ErroProvedorIA` — nunca deixa vazar erro do SDK.
   */
  completarComSchema<T>(entrada: {
    mensagens: readonly MensagemIA[];
    schema: ZodType<T>;
    /** Nome do schema, em snake_case, só para diagnóstico e para o provedor. */
    nomeDoSchema: string;
  }): Promise<{ dados: T; consumo?: ConsumoTokens }>;
}
