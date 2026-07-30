/**
 * Rótulos e badges para `ClassePatrimonio` (SPEC 5.6). Compartilhado entre o
 * histórico de snapshots e o formulário de novo snapshot desta rota.
 */
import type { ClassePatrimonio } from '@/domain/model/enums';
import { CLASSE_PATRIMONIO } from '@/domain/model/enums';

export const CLASSE_LABEL: Record<ClassePatrimonio, string> = {
  CONTA: 'Conta',
  RENDA_FIXA: 'Renda fixa',
  RENDA_VARIAVEL: 'Renda variável',
  CRIPTO: 'Cripto',
  IMOVEL: 'Imóvel',
  OUTRO: 'Outro',
};

export const CLASSES_PATRIMONIO: readonly ClassePatrimonio[] = CLASSE_PATRIMONIO;
