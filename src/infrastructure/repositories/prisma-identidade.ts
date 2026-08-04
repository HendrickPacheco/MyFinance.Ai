/**
 * Adapters Prisma das portas de identidade (usuários e sessões).
 * Vivem separados de `prisma-repositories.ts` porque são de outro assunto:
 * autenticação, não finanças.
 */
import type { PrismaClient } from '@prisma/client';
import type { Papel } from '@/domain/auth/ator';
import type { Usuario } from '@/domain/auth/usuario';
import { Prisma } from '@prisma/client';
import {
  EmailJaUsadoError,
  type NovoUsuario,
  type RegistroSessao,
  type SessaoRepository,
  type UsuarioRepository,
} from '@/domain/ports/usuarios';

/**
 * `papel` é `String` no banco. Qualquer valor que não seja exatamente 'OWNER'
 * vira 'VIEWER' — falha fechada: um papel corrompido ou desconhecido nunca
 * pode virar permissão de escrita por acidente.
 */
function papelDoBanco(valor: string): Papel {
  return valor === 'OWNER' ? 'OWNER' : 'VIEWER';
}

interface LinhaUsuario {
  id: string;
  email: string;
  nome: string | null;
  senhaHash: string | null;
  papel: string;
  ativo: boolean;
}

function paraUsuario(linha: LinhaUsuario): Usuario {
  return {
    id: linha.id,
    email: linha.email,
    nome: linha.nome,
    senhaHash: linha.senhaHash,
    papel: papelDoBanco(linha.papel),
    ativo: linha.ativo,
  };
}

export class PrismaUsuarioRepository implements UsuarioRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async porEmail(email: string): Promise<Usuario | null> {
    // Email é gravado normalizado (minúsculas) pelo seed; normalizamos a
    // consulta pelo mesmo critério para que capitalização não vire "conta não
    // existe".
    const linha = await this.prisma.usuario.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    return linha ? paraUsuario(linha) : null;
  }

  async porId(id: string): Promise<Usuario | null> {
    const linha = await this.prisma.usuario.findUnique({ where: { id } });
    return linha ? paraUsuario(linha) : null;
  }

  async criar(dados: NovoUsuario): Promise<Usuario> {
    try {
      const linha = await this.prisma.usuario.create({
        data: {
          email: dados.email.trim().toLowerCase(),
          senhaHash: dados.senhaHash,
          papel: dados.papel,
          nome: dados.nome,
          ativo: true,
        },
      });
      return paraUsuario(linha);
    } catch (erro) {
      // P2002 = violação de unicidade. Deixamos o BANCO decidir: um `porEmail`
      // antes do insert deixaria uma janela de corrida entre os dois passos.
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        throw new EmailJaUsadoError();
      }
      throw erro;
    }
  }
}

export class PrismaSessaoRepository implements SessaoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async criar(registro: RegistroSessao): Promise<void> {
    await this.prisma.sessao.create({ data: registro });
  }

  async porId(id: string): Promise<RegistroSessao | null> {
    const linha = await this.prisma.sessao.findUnique({ where: { id } });
    return linha
      ? { id: linha.id, usuarioId: linha.usuarioId, expiraEm: linha.expiraEm }
      : null;
  }

  async estender(id: string, expiraEm: Date): Promise<void> {
    await this.prisma.sessao.update({ where: { id }, data: { expiraEm } });
  }

  async excluir(id: string): Promise<void> {
    // `deleteMany` em vez de `delete`: apagar uma sessão que já não existe
    // (logout duplo, corrida entre abas) não deve virar exceção.
    await this.prisma.sessao.deleteMany({ where: { id } });
  }

  async excluirExpiradas(agora: Date): Promise<void> {
    await this.prisma.sessao.deleteMany({ where: { expiraEm: { lt: agora } } });
  }
}
