import { redirect } from 'next/navigation';

/**
 * `/custos` não tem conteúdo próprio: a seção é um conjunto de sub-rotas
 * irmãs e a primeira aba é a de custos fixos.
 */
export default function CustosPage() {
  redirect('/custos/fixos');
}
