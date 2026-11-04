'use client';

/**
 * Painel de gestão de tokens da API do agente externo (feat/agent-api-v1,
 * tela `/config/tokens`). Mesmo padrão de `BackupControles`: formulário +
 * lista no mesmo componente cliente, `router.refresh()` depois de cada
 * mutação para a lista vir sempre do servidor (nunca otimista — token é
 * credencial, estado desincronizado aqui é pior que uma reconsulta).
 */
import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, KeyRound } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  ConfirmInline,
  Input,
  Label,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from '@/components/ui';
import type { EscopoAgente } from '@/domain/auth/api-token';
import type { ApiTokenResumo } from '@/application/api-tokens';
import { criarTokenAction, revogarTokenAction } from '@/actions/tokens';

const ESCOPOS: readonly EscopoAgente[] = ['read', 'write', 'admin'];
const RESTANTE_EXIBIVEL_DO_PREFIXO = '…';

function formatarData(data: Date | string | null): string {
  if (!data) return '—';
  return new Date(data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function estadoDoToken(token: ApiTokenResumo): { texto: string; tone: 'positivo' | 'negativo' | 'atencao' } {
  if (token.revogadoEm) return { texto: 'Revogado', tone: 'negativo' };
  if (token.expiraEm && new Date(token.expiraEm).getTime() <= Date.now()) {
    return { texto: 'Expirado', tone: 'atencao' };
  }
  return { texto: 'Ativo', tone: 'positivo' };
}

function FormularioNovoToken({ onCriado }: { onCriado: () => void }) {
  const idBase = useId();
  const [nome, setNome] = useState('');
  const [escopos, setEscopos] = useState<Set<EscopoAgente>>(new Set(['read']));
  const [expiraEmData, setExpiraEmData] = useState('');
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [tokenCriado, setTokenCriado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const alternarEscopo = (escopo: EscopoAgente) => {
    setEscopos((atual) => {
      const novo = new Set(atual);
      if (novo.has(escopo)) novo.delete(escopo);
      else novo.add(escopo);
      return novo;
    });
  };

  const criar = () => {
    setErro(null);
    startTransition(async () => {
      const r = await criarTokenAction({
        nome,
        escopos: [...escopos],
        expiraEmData: expiraEmData || null,
      });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setTokenCriado(r.data.token);
      setNome('');
      setExpiraEmData('');
      setEscopos(new Set(['read']));
      onCriado();
    });
  };

  const copiar = async () => {
    if (!tokenCriado) return;
    await navigator.clipboard.writeText(tokenCriado);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  if (tokenCriado) {
    return (
      <div className="space-y-3 rounded-xl border border-atencao/40 bg-atencao/10 p-4">
        <p className="text-sm font-medium text-atencao">
          Guarde este token agora — ele não será mostrado de novo.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 text-xs text-fg">
            {tokenCriado}
          </code>
          <Button variant="outline" size="sm" onClick={() => void copiar()}>
            {copiado ? <Check size={14} /> : <Copy size={14} />}
            {copiado ? 'Copiado' : 'Copiar'}
          </Button>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setTokenCriado(null)}>
          Fechar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor={`${idBase}-nome`}>Nome</Label>
        <Input
          id={`${idBase}-nome`}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex.: Copiloto externo"
        />
      </div>

      <div>
        <Label>Escopos</Label>
        <div className="flex gap-4">
          {ESCOPOS.map((escopo) => (
            <label key={escopo} className="flex items-center gap-2 text-sm text-fg">
              <Checkbox checked={escopos.has(escopo)} onChange={() => alternarEscopo(escopo)} />
              {escopo}
            </label>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor={`${idBase}-expira`}>Expira em (opcional)</Label>
        <Input
          id={`${idBase}-expira`}
          type="date"
          value={expiraEmData}
          onChange={(e) => setExpiraEmData(e.target.value)}
        />
      </div>

      {erro ? <p className="text-sm text-negativo">{erro}</p> : null}

      <Button onClick={criar} disabled={pending || nome.trim().length === 0}>
        {pending ? 'Criando…' : 'Criar token'}
      </Button>
    </div>
  );
}

function LinhaToken({ token, onRevogado }: { token: ApiTokenResumo; onRevogado: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const estado = estadoDoToken(token);

  const revogar = () => {
    startTransition(async () => {
      const r = await revogarTokenAction({ id: token.id });
      setConfirmando(false);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      onRevogado();
    });
  };

  return (
    <>
      <Tr>
        <Td>{token.nome}</Td>
        <Td className="tnum">
          {token.prefixo}
          {RESTANTE_EXIBIVEL_DO_PREFIXO}
        </Td>
        <Td>
          <div className="flex gap-1">
            {token.escopos.map((escopo) => (
              <Badge key={escopo} tone="neutral">
                {escopo}
              </Badge>
            ))}
          </div>
        </Td>
        <Td className="tnum">{formatarData(token.criadoEm)}</Td>
        <Td className="tnum">{formatarData(token.ultimoUsoEm)}</Td>
        <Td className="tnum">{formatarData(token.expiraEm)}</Td>
        <Td>
          <Badge tone={estado.tone}>{estado.texto}</Badge>
        </Td>
        <Td>
          {!token.revogadoEm && !confirmando ? (
            <Button variant="outline" size="sm" onClick={() => setConfirmando(true)}>
              Revogar
            </Button>
          ) : null}
        </Td>
      </Tr>
      {confirmando ? (
        <Tr>
          <Td colSpan={8}>
            <ConfirmInline
              titulo={`Revogar o token "${token.nome}"?`}
              descricao="Qualquer requisição que use esta credencial passa a ser recusada imediatamente."
              confirmLabel="Revogar"
              tone="negativo"
              pendente={pending}
              onConfirm={revogar}
              onCancel={() => setConfirmando(false)}
            />
            {erro ? <p className="mt-2 text-sm text-negativo">{erro}</p> : null}
          </Td>
        </Tr>
      ) : null}
    </>
  );
}

export function TokensPainel({ tokens }: { tokens: ApiTokenResumo[] }) {
  const router = useRouter();
  const atualizar = () => router.refresh();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Novo token</CardTitle>
        </CardHeader>
        <CardContent>
          <FormularioNovoToken onCriado={atualizar} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tokens existentes</CardTitle>
        </CardHeader>
        <CardContent>
          {tokens.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted">
              <KeyRound size={16} /> Nenhum token criado ainda.
            </p>
          ) : (
            <Table legenda={`Tokens da API do agente, ${tokens.length} no total`}>
              <THead>
                <Tr>
                  <Th>Nome</Th>
                  <Th>Prefixo</Th>
                  <Th>Escopos</Th>
                  <Th>Criado</Th>
                  <Th>Último uso</Th>
                  <Th>Expira</Th>
                  <Th>Status</Th>
                  <Th>Ações</Th>
                </Tr>
              </THead>
              <TBody>
                {tokens.map((token) => (
                  <LinhaToken key={token.id} token={token} onRevogado={atualizar} />
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
