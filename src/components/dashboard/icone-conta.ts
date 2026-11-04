import {
  Building2, Car, CreditCard, Droplet, Dumbbell, FileText, GraduationCap, HeartPulse, House,
  Receipt, ShoppingBag, Wifi, Zap, type LucideIcon,
} from 'lucide-react';

const REGRAS: [RegExp, LucideIcon][] = [
  [/faculdade|escola|curso/, GraduationCap],
  [/carro|moto|auto|oficina/, Car],
  [/condom/, Building2],
  [/aluguel|casa/, House],
  [/contab|imposto|document/, FileText],
  [/renner|loja|roupa|compra|shopping/, ShoppingBag],
  [/academia/, Dumbbell],
  [/saude|plano|medic/, HeartPulse],
  [/energia|luz/, Zap],
  [/agua/, Droplet],
  [/internet|celular|telefone/, Wifi],
];

/** Ícone da conta pelo nome (sem acento/caixa); sem palavra-chave, cai no tipo. */
export function iconeDaConta(nome: string, tipo: 'FIXO' | 'PARCELA'): LucideIcon {
  const n = nome.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return REGRAS.find(([re]) => re.test(n))?.[1] ?? (tipo === 'FIXO' ? Receipt : CreditCard);
}
