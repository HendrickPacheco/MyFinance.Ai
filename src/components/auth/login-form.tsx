'use client';

import { useCallback, useState, useTransition } from 'react';
import { Button, Input, Label } from '@/components/ui';
import { entrar } from '@/actions/auth';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const enviar = useCallback(
    (evento: React.FormEvent<HTMLFormElement>) => {
      evento.preventDefault();
      setErro(null);

      startTransition(async () => {
        const r = await entrar({ email, senha });
        if (!r.ok) {
          // A mensagem vem do servidor e é deliberadamente genérica — não
          // distingue "email não existe" de "senha errada".
          setErro(r.erro);
          setSenha('');
          return;
        }
        // Carregamento COMPLETO, não `router.replace`. A navegação do
        // App Router revalidaria a rota atual (/login), que agora redireciona
        // para / — e a transição fica presa nesse vai-e-vem. Um reload limpo
        // faz middleware e layout reavaliarem a sessão nova do zero, que é
        // exatamente o que se quer logo após entrar.
        window.location.assign('/');
      });
    },
    [email, senha],
  );

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-h-[44px]"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="senha">Senha</Label>
        <Input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="min-h-[44px]"
        />
      </div>

      {erro ? (
        <p role="alert" className="text-sm text-red-400">
          {erro}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="min-h-[44px] w-full">
        {pending ? 'Entrando...' : 'Entrar'}
      </Button>
    </form>
  );
}
