'use client';

import { useCallback, useState, useTransition } from 'react';
import { Button, Input, Label } from '@/components/ui';
import { cadastrar } from '@/actions/cadastro';

/** Espelha `TAMANHO_MINIMO_SENHA` do caso de uso; o servidor é quem decide. */
const MINIMO_SENHA = 12;

export function CadastroForm() {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const senhaCurta = senha.length > 0 && senha.length < MINIMO_SENHA;

  const enviar = useCallback(
    (evento: React.FormEvent<HTMLFormElement>) => {
      evento.preventDefault();
      setErro(null);

      startTransition(async () => {
        const r = await cadastrar({ nome: nome || undefined, email, senha, codigo });
        if (!r.ok) {
          setErro(r.erro);
          setSenha('');
          return;
        }
        // Carregamento completo, pelo mesmo motivo do login: middleware e
        // layout precisam reavaliar a sessão nova do zero.
        window.location.assign('/');
      });
    },
    [nome, email, senha, codigo],
  );

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nome">Nome (opcional)</Label>
        <Input
          id="nome"
          name="nome"
          autoComplete="name"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="min-h-[44px]"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
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
          autoComplete="new-password"
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          aria-describedby="ajuda-senha"
          className="min-h-[44px]"
        />
        <p
          id="ajuda-senha"
          className={senhaCurta ? 'text-xs text-amber-400' : 'text-xs text-muted'}
        >
          Mínimo de {MINIMO_SENHA} caracteres. Uma frase longa vale mais que símbolos.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="codigo">Código de convite</Label>
        <Input
          id="codigo"
          name="codigo"
          required
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          aria-describedby="ajuda-codigo"
          className="min-h-[44px]"
        />
        <p id="ajuda-codigo" className="text-xs text-muted">
          Peça a quem administra o app.
        </p>
      </div>

      {erro ? (
        <p role="alert" className="text-sm text-red-400">
          {erro}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="min-h-[44px] w-full">
        {pending ? 'Criando conta...' : 'Criar conta'}
      </Button>
    </form>
  );
}
