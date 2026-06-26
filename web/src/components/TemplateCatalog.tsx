import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type TemplateCatalog as TCatalog, type TemplateCard } from '../lib/api';
import { toast } from '../lib/toast';
import { Spinner, ErrorNote } from './ui';
import { Icon } from './icons';

interface InstallResult {
  installed: string;
  services: { id: string; name: string; type: string }[];
  credentials?: {
    generated?: Record<string, string>;
    defaults?: { user: string; password: string; note?: string };
  };
}

// Loja de templates estilo EasyPanel: busca + categorias + cards com 1-clique.
export function TemplateCatalog({
  projectId,
  open,
  onClose,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('Todos');
  const [installing, setInstalling] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [credResult, setCredResult] = useState<{ name: string; creds: InstallResult['credentials']; serviceId: string } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get<TCatalog>('/templates'),
    enabled: open,
  });

  const install = useMutation({
    mutationFn: (slug: string) =>
      api.post<InstallResult>(`/templates/${slug}/install`, { projectId }),
    onMutate: (slug: string) => { setInstalling(slug); setErr(''); },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      const appService = r.services.find((s) => s.type === 'app') ?? r.services[0];
      // Se há credenciais geradas ou padrão, mostra o modal antes de navegar
      if (r.credentials && (r.credentials.generated || r.credentials.defaults)) {
        setCredResult({ name: r.installed, creds: r.credentials, serviceId: appService?.id ?? '' });
      } else {
        toast.success(`Template "${r.installed}" instalado — deploy iniciado.`);
        onClose();
        if (appService) navigate(`/service/${appService.id}`);
      }
    },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : 'Falhou ao instalar'),
    onSettled: () => setInstalling(null),
  });

  const cats = useMemo(() => ['Todos', ...(data?.categories ?? [])], [data]);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data?.templates ?? []).filter((tpl) => {
      const okCat = cat === 'Todos' || tpl.category === cat;
      const okText = !t || tpl.name.toLowerCase().includes(t) || tpl.description.toLowerCase().includes(t);
      return okCat && okText;
    });
  }, [data, q, cat]);

  if (!open) return null;

  // Modal de credenciais pós-instalação
  if (credResult) {
    return (
      <CredentialsModal
        name={credResult.name}
        creds={credResult.creds}
        onClose={() => {
          const id = credResult.serviceId;
          setCredResult(null);
          onClose();
          if (id) navigate(`/service/${id}`);
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[6vh] backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho + busca */}
        <div className="border-b border-line p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ink">Templates</h2>
              <p className="label">Instale um app pronto com um clique</p>
            </div>
            <button onClick={onClose} className="rounded-lg border border-line px-2.5 py-1 text-sm text-ink hover:bg-panel2">✕</button>
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar app (WordPress, n8n, Postgres…)"
            className="field"
            autoFocus
          />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {cats.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={[
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  cat === c ? 'border-brand bg-brand/10 text-brand-ink' : 'border-line text-muted hover:bg-panel2',
                ].join(' ')}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Grade de templates */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && <Spinner />}
          {error && <ErrorNote message={(error as Error).message} />}
          {err && <div className="mb-3"><ErrorNote message={err} /></div>}
          {data && filtered.length === 0 && (
            <p className="py-10 text-center text-sm text-muted">Nenhum app encontrado.</p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {filtered.map((tpl) => (
              <Card key={tpl.slug} tpl={tpl} busy={installing === tpl.slug} onInstall={() => install.mutate(tpl.slug)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ tpl, busy, onInstall }: { tpl: TemplateCard; busy: boolean; onInstall: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-panel p-3 transition-colors hover:border-brand/40">
      <TemplateLogo logo={tpl.logo} name={tpl.name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-ink">{tpl.name}</span>
          {tpl.serviceCount > 1 && (
            <span className="rounded-full bg-panel2 px-1.5 text-[10px] text-muted">{tpl.serviceCount} serviços</span>
          )}
          {(tpl as TemplateCard & { hasCredentials?: boolean }).hasCredentials && (
            <span className="flex items-center gap-0.5 rounded-full border border-brand/20 bg-brand/5 px-1.5 text-[10px] text-brand">
              <Icon name="shield" className="h-2.5 w-2.5" /> creds
            </span>
          )}
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted">{tpl.description}</p>
        <button
          onClick={onInstall}
          disabled={busy}
          className="btn-brand mt-2 px-3 py-1 text-xs disabled:opacity-60"
        >
          {busy ? 'Instalando…' : 'Instalar'}
        </button>
      </div>
    </div>
  );
}

// Modal exibido uma única vez após instalação — mostra as credenciais geradas.
function CredentialsModal({
  name,
  creds,
  onClose,
}: {
  name: string;
  creds: InstallResult['credentials'];
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  function copy(val: string, key: string) {
    navigator.clipboard?.writeText(val);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-brand/30 bg-panel shadow-pop">
        <div className="border-b border-line p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ok/10 text-ok">
              <Icon name="shield" className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold text-ink">Credenciais de acesso</h2>
              <p className="text-xs text-muted">{name} — salve antes de fechar</p>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-xs text-warn">
            Estas credenciais são exibidas <span className="font-semibold">uma única vez</span>. Salve-as agora.
          </div>

          {/* Credenciais geradas (senhas aleatórias fortes) */}
          {creds?.generated && Object.entries(creds.generated).map(([key, val]) => (
            <CredRow key={key} label={key} value={val} copied={copied === key} onCopy={() => copy(val, key)} />
          ))}

          {/* Credenciais padrão do app */}
          {creds?.defaults && (
            <>
              <CredRow label="Usuário" value={creds.defaults.user} copied={copied === 'user'} onCopy={() => copy(creds.defaults!.user, 'user')} />
              <CredRow label="Senha" value={creds.defaults.password} copied={copied === 'password'} onCopy={() => copy(creds.defaults!.password, 'password')} />
              {creds.defaults.note && (
                <p className="text-xs text-muted">{creds.defaults.note}</p>
              )}
            </>
          )}
        </div>

        <div className="border-t border-line px-5 py-4">
          <button onClick={onClose} className="btn-brand w-full">
            Entendido — ir para o serviço
          </button>
        </div>
      </div>
    </div>
  );
}

function CredRow({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div>
      <div className="label mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-lg border border-line bg-panel2 px-3 py-2 font-mono text-sm text-ink">
          {value}
        </code>
        <button
          onClick={onCopy}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-panel2 hover:text-ink"
          title="Copiar"
        >
          <Icon name={copied ? 'check' : 'copy'} className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// Logotipo oficial via URL; se a imagem falhar, mostra a inicial do nome.
function TemplateLogo({ logo, name }: { logo: string; name: string }) {
  const [failed, setFailed] = useState(!logo || !/^https?:\/\//.test(logo));
  if (failed) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-panel2 text-sm font-semibold text-muted">
        {name.charAt(0).toUpperCase()}
      </div>
    );
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-panel2 p-1.5">
      <img src={logo} alt={name} loading="lazy" className="h-full w-full object-contain" onError={() => setFailed(true)} />
    </div>
  );
}
