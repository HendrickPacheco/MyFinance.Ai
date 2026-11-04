import { TrendingUp } from 'lucide-react';
import { TemaToggle } from '@/components/layout/tema-toggle';

export function HomeHeader({
  mesNome,
  diaDoCiclo,
  diasTotais,
  iniciais,
}: {
  mesNome: string;
  diaDoCiclo: number;
  diasTotais: number;
  iniciais: string;
}) {
  return (
    <header className="mb-7 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2.5 text-[18px] font-extrabold tracking-[-0.02em]">
        <div className="grid size-8 place-items-center rounded-[10px] bg-gradient-to-br from-accent-from to-accent-hover text-accent-fg">
          <TrendingUp size={18} strokeWidth={2} aria-hidden />
        </div>
        MyFinance
      </div>
      <div className="flex items-center gap-[18px] max-[760px]:gap-2.5">
        <span className="whitespace-nowrap text-sm font-medium text-muted max-[760px]:text-xs">
          {mesNome} · dia {diaDoCiclo} de {diasTotais}
        </span>
        <TemaToggle className="max-[760px]:hidden" />
        <div className="grid size-[38px] place-items-center rounded-full bg-accent-avatar text-sm font-bold text-accent">
          {iniciais}
        </div>
      </div>
    </header>
  );
}
