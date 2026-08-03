import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { BackupControles } from '@/components/config/backup-controles';

export const dynamic = 'force-dynamic';

export default function BackupPage() {
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
