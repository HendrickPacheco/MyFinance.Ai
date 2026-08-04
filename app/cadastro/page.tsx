import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { CadastroForm } from '@/components/auth/cadastro-form';
import { criarDeps } from '@/composition';
import { estaAutenticado } from '@/domain/auth/ator';
import { cadastroEstaHabilitado } from '@/infrastructure/auth/config-cadastro';

export const metadata: Metadata = { title: 'Criar conta' };
export const dynamic = 'force-dynamic';

export default async function CadastroPage() {
  // Sem `CADASTRO_CODIGO` configurado a rota não existe — 404, não uma tela
  // dizendo "desabilitado". Não há por que anunciar a um visitante que existe
  // um cadastro esperando um código.
  if (!cadastroEstaHabilitado()) notFound();

  const deps = await criarDeps();
  if (estaAutenticado(deps.ator)) redirect('/');

  return (
    <div className="flex min-h-[70dvh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Criar conta</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Sua conta tem as próprias finanças. Você não vê os dados de outras pessoas, e
            ninguém vê os seus.
          </p>
          <CadastroForm />
          <p className="text-center text-sm text-muted">
            Já tem conta?{' '}
            <Link href="/login" className="text-accent hover:underline">
              Entrar
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
