'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Input, Select, Label, Button } from '@/components/ui';
import { formatBRL } from '@/shared/dinheiro';
import { CLASSE_PATRIMONIO, type ClassePatrimonio } from '@/domain/model/enums';
import { MoneyInput } from './money-input';

export interface LinhaPatrimonio {
  key: string;
  nome: string;
  classe: ClassePatrimonio;
  valorCents: number;
  /**
   * Conta do razão que este item fotografa. O editor não deixa escolher — ele
   * só PRESERVA o vínculo que veio da sugestão, para que fechar o ciclo não
   * desfaça a conciliação configurada na tela de Patrimônio.
   */
  contaId?: string | null;
}

const CLASSE_LABEL: Record<ClassePatrimonio, string> = {
  CONTA: 'Conta',
  RENDA_FIXA: 'Renda fixa',
  RENDA_VARIAVEL: 'Renda variável',
  CRIPTO: 'Cripto',
  IMOVEL: 'Imóvel',
  OUTRO: 'Outro',
};

/** Passo 4: snapshot de patrimônio, opcional — lista vazia pula o passo. */
export function PatrimonioEditor({
  data,
  onChangeData,
  linhas,
  onChangeLinhas,
}: {
  data: string;
  onChangeData: (data: string) => void;
  linhas: LinhaPatrimonio[];
  onChangeLinhas: (linhas: LinhaPatrimonio[]) => void;
}) {
  const atualizarLinha = (key: string, patch: Partial<Omit<LinhaPatrimonio, 'key'>>) => {
    onChangeLinhas(linhas.map((linha) => (linha.key === key ? { ...linha, ...patch } : linha)));
  };

  const removerLinha = (key: string) => {
    onChangeLinhas(linhas.filter((linha) => linha.key !== key));
  };

  const adicionarLinha = () => {
    onChangeLinhas([
      ...linhas,
      { key: crypto.randomUUID(), nome: '', classe: 'CONTA', valorCents: 0 },
    ]);
  };

  const total = linhas.reduce((acc, linha) => acc + linha.valorCents, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>4. Snapshot de patrimônio</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          Atualize os valores de cada item. Opcional — pode pular removendo todas as linhas.
        </p>

        <div>
          <Label htmlFor="snapshot-data">Data do snapshot</Label>
          <Input
            id="snapshot-data"
            type="date"
            value={data}
            onChange={(evento) => onChangeData(evento.target.value)}
          />
        </div>

        {linhas.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {linhas.map((linha) => (
              <li
                key={linha.key}
                className="flex flex-col gap-2 rounded-xl border border-border bg-surface-2 p-3 sm:flex-row sm:items-end"
              >
                <div className="flex-1">
                  <Label htmlFor={`nome-${linha.key}`}>Nome</Label>
                  <Input
                    id={`nome-${linha.key}`}
                    value={linha.nome}
                    onChange={(evento) => atualizarLinha(linha.key, { nome: evento.target.value })}
                    placeholder="Ex.: Conta corrente"
                  />
                </div>
                <div className="sm:w-40">
                  <Label htmlFor={`classe-${linha.key}`}>Classe</Label>
                  <Select
                    id={`classe-${linha.key}`}
                    value={linha.classe}
                    onChange={(evento) =>
                      atualizarLinha(linha.key, { classe: evento.target.value as ClassePatrimonio })
                    }
                  >
                    {CLASSE_PATRIMONIO.map((classe) => (
                      <option key={classe} value={classe}>
                        {CLASSE_LABEL[classe]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="sm:w-36">
                  <Label htmlFor={`valor-${linha.key}`}>Valor</Label>
                  <MoneyInput
                    id={`valor-${linha.key}`}
                    valueCents={linha.valorCents}
                    onChangeCents={(cents) => atualizarLinha(linha.key, { valorCents: cents })}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-[44px] shrink-0"
                  onClick={() => removerLinha(linha.key)}
                  aria-label={`Remover ${linha.nome || 'item sem nome'}`}
                >
                  <Trash2 size={18} />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-faint">Nenhum item — este passo será pulado.</p>
        )}

        <Button type="button" variant="outline" size="sm" onClick={adicionarLinha} className="self-start">
          <Plus size={16} /> Adicionar item
        </Button>

        {linhas.length > 0 ? (
          <p className="tnum text-sm text-muted">Total: {formatBRL(total)}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
