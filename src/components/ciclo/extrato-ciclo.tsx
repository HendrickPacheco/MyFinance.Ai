'use client';

/**
 * Extrato do ciclo (SPEC 7): lista de transações mais recentes primeiro, com
 * filtro por categoria. `transacoes` chega ordenada por data ascendente —
 * aqui invertemos para exibição.
 */
import { useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Select, EmptyState } from '@/components/ui';
import { TransacaoLinha } from './transacao-linha';
import type { Categoria, Transacao } from '@/domain/model/entidades';

const TODAS_CATEGORIAS = '__todas__';

export function ExtratoCiclo({
  transacoes,
  categorias,
}: {
  transacoes: Transacao[];
  categorias: Categoria[];
}) {
  const [filtroCategoriaId, setFiltroCategoriaId] = useState(TODAS_CATEGORIAS);

  const categoriaPorId = useMemo(() => {
    const mapa = new Map<string, Categoria>();
    for (const c of categorias) mapa.set(c.id, c);
    return mapa;
  }, [categorias]);

  const listaExibida = useMemo(() => {
    const invertida = [...transacoes].reverse();
    if (filtroCategoriaId === TODAS_CATEGORIAS) return invertida;
    return invertida.filter((t) => t.categoriaId === filtroCategoriaId);
  }, [transacoes, filtroCategoriaId]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
        <CardTitle>Extrato do ciclo</CardTitle>
        <Select
          aria-label="Filtrar por categoria"
          value={filtroCategoriaId}
          onChange={(e) => setFiltroCategoriaId(e.target.value)}
          className="h-9 w-auto min-w-[9rem] text-sm"
        >
          <option value={TODAS_CATEGORIAS}>Todas categorias</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </Select>
      </CardHeader>
      <CardContent>
        {listaExibida.length === 0 ? (
          <EmptyState
            titulo="Nada por aqui"
            descricao={
              filtroCategoriaId === TODAS_CATEGORIAS
                ? 'Nenhuma transação neste ciclo ainda.'
                : 'Nenhuma transação nesta categoria neste ciclo.'
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {listaExibida.map((t) => (
              <TransacaoLinha
                key={t.id}
                transacao={t}
                categoria={t.categoriaId ? categoriaPorId.get(t.categoriaId) : undefined}
                categorias={categorias}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
