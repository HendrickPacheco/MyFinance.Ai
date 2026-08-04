/**
 * Rate limiter de janela fixa, em memória do processo (TASKS-AUTH §6).
 *
 * TRADE-OFFS ASSUMIDOS ABERTAMENTE:
 *  - Reseta quando o server reinicia. Para TAXA (tentativas de login, escritas)
 *    isso é aceitável num app local: quem consegue reiniciar seu server já tem
 *    a máquina.
 *  - Não coordena entre processos. Não há múltiplas instâncias — é por isso que
 *    não há Redis aqui; ele existiria para resolver um problema que não temos.
 *  - NÃO serve para teto de DINHEIRO. Um loop de reinícios furaria um limite de
 *    gasto de IA. Por isso o teto de custo mora no Postgres (`UsoIA`), não aqui.
 *
 * Trocar por Redis/Postgres depois não toca nenhuma action nem caso de uso:
 * basta outro adapter da mesma `RateLimiterPort`.
 */
import type { RateLimiterPort } from '@/domain/ports/rate-limiter';

interface Janela {
  contagem: number;
  reiniciaEm: number;
}

export class RateLimiterMemoria implements RateLimiterPort {
  private readonly janelas = new Map<string, Janela>();

  /** Injetável para teste determinístico (sem esperar relógio de parede). */
  constructor(private readonly agoraMs: () => number = () => Date.now()) {}

  async permitir(chave: string, limite: number, janelaMs: number): Promise<boolean> {
    const agora = this.agoraMs();
    const atual = this.janelas.get(chave);

    // `limite <= 0` significa "nada permitido" e precisa ser checado ANTES de
    // abrir a janela — senão a primeira chamada de cada janela passaria de
    // graça, e um limite de zero não limitaria nada.
    if (limite <= 0) return false;

    if (!atual || agora >= atual.reiniciaEm) {
      this.janelas.set(chave, { contagem: 1, reiniciaEm: agora + janelaMs });
      this.coletarLixo(agora);
      return true;
    }

    if (atual.contagem >= limite) return false;

    atual.contagem += 1;
    return true;
  }

  /**
   * Remove janelas vencidas para o Map não crescer sem limite. Roda só quando
   * uma janela nova é aberta, e sai cedo enquanto o mapa é pequeno — o custo
   * some no uso normal (um usuário).
   */
  private coletarLixo(agora: number): void {
    if (this.janelas.size < 512) return;
    for (const [chave, janela] of this.janelas) {
      if (agora >= janela.reiniciaEm) this.janelas.delete(chave);
    }
  }
}
