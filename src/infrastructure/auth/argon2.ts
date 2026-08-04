/**
 * Adapter de hashing de senha: Argon2id.
 *
 * ÚNICO arquivo do projeto que importa `@node-rs/argon2` (binário nativo, sem
 * chamada de rede — o login funciona offline, que é a razão de termos escolhido
 * sessão própria em vez de OAuth2; ver TASKS-AUTH §2.1).
 */
import { hash, verify } from '@node-rs/argon2';
import type { HashSenhaPort } from '@/domain/ports/hash-senha';

/**
 * Piso recomendado pelo OWASP para Argon2id: m=19456 KiB (19 MiB), t=2, p=1.
 * Subir `memoryCost` é o que mais encarece um ataque de GPU; mexer aqui é
 * seguro porque o hash gravado carrega seus próprios parâmetros — senhas
 * antigas continuam verificáveis após uma mudança.
 */
/**
 * `2` é `Algorithm.Argon2id` da lib. Usamos o literal porque o enum dela é um
 * `const enum` ambiente, inacessível sob `isolatedModules` (que este projeto
 * usa). O teste `argon2.test.ts` verifica o prefixo `$argon2id$` do hash, então
 * uma troca acidental de variante quebra o build de testes, não o silêncio.
 */
const ARGON2ID = 2;

const PARAMETROS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export class Argon2HashSenha implements HashSenhaPort {
  async hashear(senha: string): Promise<string> {
    return hash(senha, PARAMETROS);
  }

  /**
   * `verify` da lib compara em tempo constante e devolve `false` para hash
   * malformado. Capturamos o erro para que um `senhaHash` corrompido no banco
   * signifique "não autenticou", nunca um 500 que revele o estado interno.
   */
  async verificar(senha: string, hashArmazenado: string): Promise<boolean> {
    try {
      return await verify(hashArmazenado, senha, PARAMETROS);
    } catch {
      return false;
    }
  }
}
