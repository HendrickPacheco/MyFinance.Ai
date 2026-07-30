import { NextResponse } from 'next/server';
import { prisma } from '@/composition';
import { exportarTudo, importarTudo } from '@/infrastructure/backup';

export const dynamic = 'force-dynamic';

/** GET → exporta o estado completo como JSON para download. */
export async function GET(): Promise<Response> {
  const dump = await exportarTudo(prisma);
  const carimbo = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(dump, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="financeiro-backup-${carimbo}.json"`,
    },
  });
}

/** POST → importa um JSON de backup (faz cópia do .db antes de sobrescrever). */
export async function POST(req: Request): Promise<Response> {
  try {
    const payload = await req.json();
    const r = await importarTudo(prisma, payload);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const erro = e instanceof Error ? e.message : 'Falha ao importar.';
    return NextResponse.json({ ok: false, erro }, { status: 400 });
  }
}
