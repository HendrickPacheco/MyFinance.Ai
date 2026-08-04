/**
 * Configuração do cadastro. ÚNICO arquivo que lê `CADASTRO_CODIGO` — mesma
 * disciplina de `config-ia.ts` para a chave da OpenAI.
 *
 * Ausente ou vazio = cadastro DESLIGADO. É a falha fechada: esquecer de
 * configurar não abre o app para o mundo, só deixa a tela indisponível.
 */
export function codigoDeCadastro(): string | undefined {
  const bruto = process.env.CADASTRO_CODIGO?.trim();
  return bruto ? bruto : undefined;
}

export function cadastroEstaHabilitado(): boolean {
  return codigoDeCadastro() !== undefined;
}
