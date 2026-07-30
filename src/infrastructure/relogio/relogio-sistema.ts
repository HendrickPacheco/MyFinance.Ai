/**
 * Adapter concreto da porta RelogioPort. Usa o relógio do sistema mas devolve
 * a data civil no timezone da Config (SPEC 5.1). Injetável nos casos de uso;
 * em testes, troca-se por um relógio fixo.
 */
import { dataCivilNoFuso, type DataCivil } from '@/shared/data';
import type { RelogioPort } from '@/domain/ports/relogio';

export class RelogioSistema implements RelogioPort {
  constructor(private readonly timezone: string) {}

  hoje(): DataCivil {
    return dataCivilNoFuso(new Date(), this.timezone);
  }

  agora(): Date {
    return new Date();
  }
}

/** Relógio fixo para testes e cenários determinísticos. */
export class RelogioFixo implements RelogioPort {
  constructor(
    private readonly dataFixa: DataCivil,
    private readonly instanteFixo: Date = new Date(`${dataFixa}T12:00:00Z`),
  ) {}

  hoje(): DataCivil {
    return this.dataFixa;
  }

  agora(): Date {
    return this.instanteFixo;
  }
}
