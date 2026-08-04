'use client';

import { createContext, useContext } from 'react';
import type { Papel } from '@/domain/auth/ator';

/**
 * Papel do ator atual, disponível para qualquer componente cliente.
 *
 * >>> ISTO É UX, NÃO SEGURANÇA. <<<
 * Esconder um botão não protege nada — qualquer um pode chamar a server action
 * direto. A trava real é `exigirEscrita(deps.ator)` na camada de aplicação
 * (src/application/*), coberta por `src/application/autorizacao.test.ts`. O
 * contexto existe só para não oferecer ao VIEWER um botão que o servidor vai
 * recusar.
 *
 * Um valor de contexto não é confiável nem no cliente: ele veio do servidor,
 * mas o cliente pode adulterá-lo em memória. Nunca decida nada sensível com ele.
 */
const PapelContexto = createContext<Papel>('VIEWER');

export function PapelProvider({
  papel,
  children,
}: {
  papel: Papel;
  children: React.ReactNode;
}) {
  return <PapelContexto.Provider value={papel}>{children}</PapelContexto.Provider>;
}

export function usePapel(): Papel {
  return useContext(PapelContexto);
}

/** Açúcar para o caso dominante: "esta pessoa pode escrever?" */
export function usePodeEscrever(): boolean {
  return useContext(PapelContexto) === 'OWNER';
}
