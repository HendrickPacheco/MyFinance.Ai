import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { BackupControles } from '@/components/config/backup-controles';

import { SomenteDono } from '@/components/auth/somente-dono';

export const dynamic = 'force-dynamic';

function BackupPageConteudo() {
  return (
    <div className="mx-auto w-full space-y-6 lg:max-w-3xl">
      <Link href="/config" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft size={16} /> Configuração
      </Link>

      <header>
        <h1 className="text-2xl font-semibold text-fg">Backup e restauração</h1>
        <p className="mt-1 text-sm text-muted">
          Num app local, o export é a sua única garantia contra perda de dados. Exporte de vez em
          quando e guarde o arquivo em um lugar seguro.
        </p>
      </header>

      <BackupControles />
    </div>
  );
}

/**
 * Tela de escrita: portão de papel (TASKS-AUTH S4.2). VIEWER vê um aviso
 * factual em vez do formulário. A trava real continua nos casos de uso.
 */
export default function BackupPage() {
  return (
    <SomenteDono>
      <BackupPageConteudo />
    </SomenteDono>
  );
}
