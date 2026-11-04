/**
 * Serializer de dinheiro das respostas da API do agente. Toda rota passa o
 * corpo da resposta por `comFmt` antes de devolvê-lo: o agente nunca recebe
 * um `*Cents` sem o par formatado ao lado (mesma disciplina das ferramentas
 * de IA em `application/ia/ferramentas/saida.ts`, só que recursiva e
 * automática em vez de montada campo a campo).
 */
import { formatBRL } from '@/shared/dinheiro';

const SUFIXO_CENTS = 'Cents';

function nomeDoCampoFmt(campo: string): string {
  return `${campo.slice(0, -SUFIXO_CENTS.length)}Fmt`;
}

/**
 * Para todo campo cuja chave termina em `Cents` e cujo valor é um número
 * inteiro, adiciona o irmão `<nome>Fmt` com `formatBRL`. Recursivo em objetos
 * e arrays; `Date` e `null` passam intactos (nunca são percorridos como
 * objeto genérico — `Date` não tem propriedade própria enumerável, então
 * tratá-la como objeto comum a reduziria a `{}`).
 */
export function comFmt<T>(valor: T): T {
  return transformar(valor) as T;
}

function transformar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(transformar);
  if (valor === null || valor instanceof Date || typeof valor !== 'object') return valor;

  const resultado: Record<string, unknown> = {};
  for (const [campo, bruto] of Object.entries(valor as Record<string, unknown>)) {
    resultado[campo] = transformar(bruto);
    if (campo.endsWith(SUFIXO_CENTS) && typeof bruto === 'number' && Number.isInteger(bruto)) {
      resultado[nomeDoCampoFmt(campo)] = formatBRL(bruto);
    }
  }
  return resultado;
}
