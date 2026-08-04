import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { LoginForm } from '@/components/auth/login-form';
import { criarDeps } from '@/composition';
import { estaAutenticado } from '@/domain/auth/ator';
import { cadastroEstaHabilitado } from '@/infrastructure/auth/config-cadastro';

export const metadata: Metadata = { title: 'Entrar' };
export const dynamic = 'force-dynamic';

/** Única rota pública do app (TASKS-AUTH §7, S4.1). */
export default async function LoginPage() {
  // Quem já tem sessão não precisa ver o formulário.
  const deps = await criarDeps();
  if (estaAutenticado(deps.ator)) redirect('/');

  return (
    <div className="flex min-h-[70dvh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Entrar</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <LoginForm />
          {/* O link só aparece com o cadastro ligado — a rota nem existe sem
              `CADASTRO_CODIGO`, e um link para 404 seria pior que link nenhum. */}
          {cadastroEstaHabilitado() ? (
            <p className="text-center text-sm text-muted">
              Não tem conta?{' '}
              <Link href="/cadastro" className="text-accent hover:underline">
                Criar conta
              </Link>
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
