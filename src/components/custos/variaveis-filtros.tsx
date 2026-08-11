'use client';

/**
 * Filtros de `/custos/variaveis`: período (atalhos + datas livres), categoria
 * e método.
 *
 * TODO o estado mora na URL, nunca em `useState` — mesma razão do horizonte da
 * projeção (§3.4) e das abas (§3.1): a página é Server Component, o dono
 * compartilha e favorita o link, e o botão voltar precisa desfazer o filtro.
 * Como consequência o TOTAL do recorte é calculado no servidor, sobre
 * exatamente as linhas que a lista mostra — filtrar aqui e somar lá é como um
 * total passa a discordar da própria lista.
 *
 * Este componente só monta URLs e navega; nenhuma regra e nenhuma aritmética.
 */
import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Label, Input, Select, Segmented } from '@/components/ui';
import { LABEL_METODO } from '@/components/dashboard/cores';
import type { MetodoPagamento } from '@/domain/model/enums';
import type { OpcaoCategoria } from '@/application/dashboard-tipos';
import {
  LABEL_PRESET,
  PRESETS_PERIODO,
  type FiltroVariaveis,
  type PresetPeriodo,
} from '@/application/variaveis-view';

const ROTA = '/custos/variaveis';

/** Nenhum atalho bate com o intervalo atual: o dono digitou as datas na mão. */
const PERSONALIZADO = 'personalizado';

export interface VariaveisFiltrosProps {
  filtro: FiltroVariaveis;
  presets: Record<PresetPeriodo, { de: string; ate: string }>;
  categorias: readonly OpcaoCategoria[];
  metodos: readonly MetodoPagamento[];
}

export function VariaveisFiltros({ filtro, presets, categorias, metodos }: VariaveisFiltrosProps) {
  const router = useRouter();

  const montarHref = useCallback(
    (patch: Partial<Record<'de' | 'ate' | 'categoria' | 'metodo', string | null>>): string => {
      const atual: Record<string, string | null> = {
        de: filtro.de,
        ate: filtro.ate,
        categoria: filtro.categoriaId,
        metodo: filtro.metodo,
        ...patch,
      };
      const query = new URLSearchParams();
      for (const [chave, valor] of Object.entries(atual)) {
        if (valor !== null && valor !== '') query.set(chave, valor);
      }
      return `${ROTA}?${query.toString()}`;
    },
    [filtro],
  );

  const presetAtivo: string =
    PRESETS_PERIODO.find(
      (p) => presets[p].de === filtro.de && presets[p].ate === filtro.ate,
    ) ?? PERSONALIZADO;

  const temFiltroDeLinha = filtro.categoriaId !== null || filtro.metodo !== null;

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface-2/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          ariaLabel="Período do extrato"
          valor={presetAtivo}
          opcoes={PRESETS_PERIODO.map((p) => ({
            value: p as string,
            label: LABEL_PRESET[p],
            href: montarHref(presets[p]),
          }))}
        />
        {temFiltroDeLinha || presetAtivo !== 'ciclo' ? (
          <Link
            href={montarHref({ ...presets.ciclo, categoria: null, metodo: null })}
            className="inline-flex min-h-[44px] items-center text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
          >
            Limpar filtros
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label htmlFor="filtro-de">De</Label>
          <Input
            id="filtro-de"
            type="date"
            value={filtro.de}
            max={filtro.ate}
            onChange={(e) => router.push(montarHref({ de: e.target.value }))}
          />
        </div>

        <div>
          <Label htmlFor="filtro-ate">Até</Label>
          <Input
            id="filtro-ate"
            type="date"
            value={filtro.ate}
            min={filtro.de}
            onChange={(e) => router.push(montarHref({ ate: e.target.value }))}
          />
        </div>

        <div>
          <Label htmlFor="filtro-categoria">Categoria</Label>
          <Select
            id="filtro-categoria"
            value={filtro.categoriaId ?? ''}
            onChange={(e) => router.push(montarHref({ categoria: e.target.value || null }))}
          >
            <option value="">Todas</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="filtro-metodo">Método</Label>
          <Select
            id="filtro-metodo"
            value={filtro.metodo ?? ''}
            onChange={(e) => router.push(montarHref({ metodo: e.target.value || null }))}
          >
            <option value="">Todos</option>
            {metodos.map((m) => (
              <option key={m} value={m}>
                {LABEL_METODO[m]}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </div>
  );
}
