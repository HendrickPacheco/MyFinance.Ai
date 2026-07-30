'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Upload, AlertTriangle } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';

export function BackupControles() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const importar = () => {
    if (!arquivo) return;
    setErro(null);
    setMsg(null);
    startTransition(async () => {
      try {
        const texto = await arquivo.text();
        const payload = JSON.parse(texto);
        const resp = await fetch('/api/backup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await resp.json();
        if (json.ok) {
          setMsg('Dados restaurados. Uma cópia do banco anterior foi guardada em /data.');
          setArquivo(null);
          setConfirmar(false);
          if (inputRef.current) inputRef.current.value = '';
          router.refresh();
        } else {
          setErro(json.erro ?? 'Falha ao importar.');
        }
      } catch {
        setErro('Arquivo inválido — não é um JSON de backup válido.');
      }
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Exportar</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted">
            Baixa um JSON com tudo: config, contas, ciclos, transações, provisões e patrimônio.
          </p>
          <a
            href="/api/backup"
            download
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-accent px-5 font-medium text-accent-fg"
          >
            <Download size={18} /> Exportar backup
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Importar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2 rounded-xl border border-atencao/40 bg-atencao/10 p-3 text-sm text-atencao">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>
              Importar <strong>substitui todos os dados atuais</strong>. Antes de gravar, o app faz
              uma cópia do banco atual em <code>/data</code>.
            </span>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              setArquivo(e.target.files?.[0] ?? null);
              setConfirmar(false);
              setMsg(null);
              setErro(null);
            }}
            className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-4 file:py-2 file:text-fg"
          />

          {arquivo && !confirmar ? (
            <Button variant="outline" onClick={() => setConfirmar(true)}>
              <Upload size={16} /> Importar {arquivo.name}
            </Button>
          ) : null}

          {arquivo && confirmar ? (
            <div className="flex gap-2">
              <Button variant="danger" onClick={importar} disabled={pending}>
                {pending ? 'Importando…' : 'Confirmar — substituir tudo'}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmar(false)} disabled={pending}>
                Cancelar
              </Button>
            </div>
          ) : null}

          {erro ? <p className="text-sm text-negativo">{erro}</p> : null}
          {msg ? <p className="text-sm text-positivo">{msg}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
