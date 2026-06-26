import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '../lib/toast';
import { api, type Deployment, type DeployStart, type ServiceFull, type WebhookInfo } from '../lib/api';
import { Card } from '../components/Card';
import { StatusDot } from '../components/StatusDot';
import { TypeBadge } from '../components/badges';
import { Icon } from '../components/icons';
import { Spinner, ErrorNote, Empty } from '../components/ui';

const TERMINAL = ['success', 'failed'];
const isInflight = (st?: string) => !!st && !TERMINAL.includes(st);

// Abas no padrão do EasyPanel (Source · Environment · Domains · Deployments · Logs · Advanced).
type Tab = 'source' | 'env' | 'domains' | 'deploys' | 'metrics' | 'logs' | 'advanced';

export function Service() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const svc = useQuery({ queryKey: ['service', id], queryFn: () => api.get<ServiceFull>(`/services/${id}`) });
  const [tab, setTab] = useState<Tab>('source');

  // ── deploy ao vivo (assíncrono + polling) ─────────────────────────────
  const [activeDep, setActiveDep] = useState<string | null>(null);
  const depQ = useQuery({
    queryKey: ['deployment', id, activeDep],
    queryFn: () => api.get<Deployment>(`/services/${id}/deployments/${activeDep}`),
    enabled: !!activeDep,
    refetchInterval: (q) => (isInflight((q.state.data as Deployment | undefined)?.status) ? 1500 : false),
  });
  // Ao terminar um deploy, atualiza o serviço (status/containers).
  useEffect(() => {
    const st = depQ.data?.status;
    if (!st || !TERMINAL.includes(st)) return;
    qc.invalidateQueries({ queryKey: ['service', id] });
    if (st === 'success') toast.success('Deploy concluído com sucesso!');
    else if (st === 'failed') toast.error('Deploy falhou — veja o log na aba Deployments.');
  }, [depQ.data?.status, id, qc]);
  // Se já houver um deploy em andamento ao abrir a página, retoma o acompanhamento.
  useEffect(() => {
    const running = svc.data?.deployments?.find((d) => isInflight(d.status));
    if (running && !activeDep) { setActiveDep(running.id); setTab('deploys'); }
  }, [svc.data, activeDep]);

  const deploy = useMutation({
    mutationFn: () => api.post<DeployStart>(`/services/${id}/deploy`),
    onSuccess: (r) => { setActiveDep(r.deploymentId); setTab('deploys'); toast.info('Deploy iniciado — acompanhe o log abaixo.'); },
    onError: (e: unknown) => toast.error((e as Error).message),
  });
  const lifecycle = useMutation({
    mutationFn: (action: 'start' | 'stop' | 'restart') => api.post(`/services/${id}/${action}`),
    onSuccess: (_d, action) => { qc.invalidateQueries({ queryKey: ['service', id] }); toast.success(`Container ${action === 'start' ? 'iniciado' : action === 'stop' ? 'parado' : 'reiniciado'}.`); },
    onError: (e: unknown) => toast.error((e as Error).message),
  });
  const destroy = useMutation({
    mutationFn: () => api.del(`/services/${id}`),
    onSuccess: () => navigate(svc.data?.project ? `/project/${svc.data.project.id}` : '/'),
    onError: (e: unknown) => toast.error((e as Error).message),
  });
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const rename = useMutation({
    mutationFn: () => api.patch(`/services/${id}`, { name: newName }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service', id] });
      qc.invalidateQueries({ queryKey: ['project', svc.data?.project?.id] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      setRenaming(false);
      toast.success('Serviço renomeado.');
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  if (svc.isLoading) return <Spinner label="carregando serviço…" />;
  if (svc.error) return <ErrorNote message={(svc.error as Error).message} />;
  const s = svc.data!;
  const isApp = s.type === 'app';
  const deploying = deploy.isPending || isInflight(depQ.data?.status);

  const TABS: { key: Tab; label: string; show: boolean }[] = [
    { key: 'source', label: 'Source', show: isApp },
    { key: 'env', label: 'Environment', show: true },
    { key: 'domains', label: 'Domains', show: true },
    { key: 'deploys', label: 'Deployments', show: true },
    { key: 'metrics', label: 'Métricas', show: true },
    { key: 'logs', label: 'Logs', show: true },
    { key: 'advanced', label: 'Advanced', show: true },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-muted">
        <Link to="/" className="hover:text-ink">Projects</Link>
        <span>/</span>
        {s.project && <Link to={`/project/${s.project.id}`} className="hover:text-ink">{s.project.name}</Link>}
        <span>/</span>
        <span className="text-ink">{s.name}</span>
      </div>

      {/* header + ações */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 text-brand-ink">
            <Icon name="cube" className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {renaming ? (
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => { e.preventDefault(); rename.mutate(); }}
                >
                  <input
                    className="field text-xl font-semibold"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Escape') setRenaming(false); }}
                  />
                  <button type="submit" className="btn-brand text-sm" disabled={!newName.trim() || rename.isPending}>
                    {rename.isPending ? '…' : 'Salvar'}
                  </button>
                  <button type="button" className="btn-ghost text-sm" onClick={() => setRenaming(false)}>Cancelar</button>
                </form>
              ) : (
                <>
                  <h1 className="truncate text-xl font-semibold text-ink">{s.name}</h1>
                  <button
                    className="rounded p-1 text-muted hover:bg-panel2 hover:text-ink"
                    title="Renomear serviço"
                    onClick={() => { setNewName(s.name); setRenaming(true); }}
                  >
                    <Icon name="pencil" className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
              <TypeBadge type={s.type} spec={s.spec} />
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-3">
              <StatusDot state={deploying ? 'restarting' : s.status} withLabel />
              {/* URL do serviço (domínio principal) — visível sempre que existir */}
              {s.domains && s.domains.length > 0 && (
                <a
                  href={`${s.domains[0].https !== false ? 'https' : 'http'}://${s.domains[0].host}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-muted hover:text-brand truncate max-w-xs"
                >
                  <Icon name="globe" className="h-3 w-3 shrink-0" />
                  {s.domains[0].host}
                </a>
              )}
            </div>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            {/* Botão ABRIR — aparece quando o serviço tem domínio (rodando ou não) */}
            {isApp && s.domains && s.domains.length > 0 && (
              <a
                href={`${s.domains[0].https !== false ? 'https' : 'http'}://${s.domains[0].host}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-brand/40 bg-brand/10 px-4 py-2 text-sm font-medium text-brand-ink transition-colors hover:bg-brand/20"
              >
                <Icon name="externalLink" className="h-4 w-4" /> Abrir
              </a>
            )}
            {isApp && (
              <button
                onClick={() => deploy.mutate()}
                disabled={deploying}
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-card transition-colors hover:bg-brand-bright disabled:opacity-60"
              >
                {deploying ? <><Spin /> Implantando…</> : <><Icon name="rocket" className="h-4 w-4" /> Deploy</>}
              </button>
            )}
            {s.status === 'running' || s.status === 'online' ? (
              <button onClick={() => lifecycle.mutate('restart')} disabled={lifecycle.isPending} className="btn-ghost text-sm"><Icon name="rotate" className="h-4 w-4" /> Restart</button>
            ) : s.containerId ? (
              <button onClick={() => lifecycle.mutate('start')} disabled={lifecycle.isPending} className="btn-ghost text-sm"><Icon name="play" className="h-4 w-4" /> Start</button>
            ) : isApp ? (
              <span className="text-xs text-muted px-2">← faça Deploy para iniciar</span>
            ) : null}
            {(s.status === 'running' || s.status === 'online') && (
              <button onClick={() => lifecycle.mutate('stop')} disabled={lifecycle.isPending} className="btn-ghost text-sm"><Icon name="pause" className="h-4 w-4" /> Stop</button>
            )}
          </div>
        </div>
        {lifecycle.error && <div className="mt-3"><ErrorNote message={(lifecycle.error as Error).message} /></div>}
        {deploy.error && <div className="mt-3"><ErrorNote message={(deploy.error as Error).message} /></div>}
      </div>

      {/* abas */}
      <div className="flex gap-1 border-b border-line">
        {TABS.filter((t) => t.show).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={[
              '-mb-px border-b-2 px-3.5 py-2 text-sm font-medium transition-colors',
              tab === t.key ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'source' && isApp && <SourceTab s={s} />}
      {tab === 'env' && <EnvTab s={s} />}
      {tab === 'domains' && <DomainsTab s={s} />}
      {tab === 'deploys' && <DeploysTab s={s} live={depQ.data} onRedeploy={() => deploy.mutate()} deploying={deploying} />}
      {tab === 'metrics' && <MetricsTab id={id} />}
      {tab === 'logs' && <LogsTab id={id} />}
      {tab === 'advanced' && <AdvancedTab s={s} onDestroy={() => destroy.mutate()} destroying={destroy.isPending} />}
    </div>
  );
}

function Spin() {
  return <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />;
}

// ── Source (origem/build) ───────────────────────────────────────────────
function SourceTab({ s }: { s: ServiceFull }) {
  const qc = useQueryClient();
  const spec = (s.spec ?? {}) as Record<string, unknown>;
  const initialSource = (spec.source as string) || (spec.repo ? 'git' : 'image');
  const [source, setSource] = useState<'git' | 'image'>(initialSource === 'git' ? 'git' : 'image');
  const [repo, setRepo] = useState((spec.repo as string) || '');
  const [branch, setBranch] = useState((spec.branch as string) || 'main');
  const [subdir, setSubdir] = useState((spec.subdir as string) || '');
  const [dockerfile, setDockerfile] = useState((spec.dockerfile as string) || '');
  const [image, setImage] = useState((spec.image as string) || '');
  // A porta interna pode estar em `spec.port` (singular) ou `spec.ports[0]` (array,
  // como vem dos templates). Ler dos dois evita mostrar o default errado (ex.: drawio
  // expõe 8080, mas caía em 3000 e salvar gravava 3000, quebrando o roteamento).
  const specPorts = spec.ports as number[] | undefined;
  const [port, setPort] = useState(String(spec.port || specPorts?.[0] || 3000));
  const [credentialId, setCredentialId] = useState((spec.credentialId as string) || '');

  const { data: gh } = useQuery({
    queryKey: ['github-status'],
    queryFn: () => api.get<{ connected: boolean; login?: string }>('/github/status'),
  });
  const { data: ghRepos } = useQuery({
    queryKey: ['github-repos'],
    queryFn: () => api.get<{ fullName: string; private: boolean; defaultBranch: string; cloneUrl: string; credentialId: string }[]>('/github/repos'),
    enabled: !!gh?.connected,
  });

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/services/${s.id}`, {
        spec:
          source === 'git'
            ? { source: 'git', repo, branch, subdir: subdir || undefined, dockerfile: dockerfile || undefined, port: Number(port), image: undefined, credentialId: credentialId || undefined }
            : { source: 'image', image, port: Number(port), repo: undefined },
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['service', s.id] }); toast.success('Source salvo.'); },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  return (
    <Card title="Source" subtitle="De onde o LiteDock constrói e implanta este app.">
      <div className="mb-4 inline-flex rounded-lg border border-line p-1">
        {(['git', 'image'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSource(t)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${source === t ? 'bg-panel2 text-ink' : 'text-muted hover:text-ink'}`}
          >
            {t === 'git' ? 'Repositório Git' : 'Imagem Docker'}
          </button>
        ))}
      </div>

      {source === 'git' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {gh?.connected && (
            <div className="sm:col-span-2">
              <label className="label mb-1 block">Conta GitHub conectada (@{gh.login})</label>
              <select
                className="field"
                value={credentialId && repo ? repo : ''}
                onChange={(e) => {
                  const r = ghRepos?.find((x) => x.cloneUrl === e.target.value);
                  if (r) { setRepo(r.cloneUrl); setBranch(r.defaultBranch || 'main'); setCredentialId(r.credentialId); }
                }}
              >
                <option value="">— escolher um repositório —</option>
                {(ghRepos ?? []).map((r) => (
                  <option key={r.fullName} value={r.cloneUrl}>{r.fullName}{r.private ? ' 🔒' : ''}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted">Escolha um repo para preencher tudo automaticamente, ou informe a URL manual abaixo. Conecte/gerencie em <Link to="/settings" className="text-brand hover:underline">Ajustes → Github</Link>.</p>
            </div>
          )}
          <div className="sm:col-span-2"><label className="label mb-1 block">Repositório (URL Git)</label><input className="field" value={repo} onChange={(e) => { setRepo(e.target.value); }} placeholder="https://github.com/voce/app.git" /></div>
          <div><label className="label mb-1 block">Branch</label><input className="field" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" /></div>
          <div><label className="label mb-1 block">Build Path (subpasta)</label><input className="field" value={subdir} onChange={(e) => setSubdir(e.target.value)} placeholder="/ (raiz)" /></div>
          <div className="sm:col-span-2"><label className="label mb-1 block">Dockerfile (opcional)</label><input className="field" value={dockerfile} onChange={(e) => setDockerfile(e.target.value)} placeholder="Dockerfile — vazio = Nixpacks detecta a stack" /></div>
          <p className="sm:col-span-2 text-xs text-muted">Com Dockerfile → <code className="text-ink">docker build</code>. Sem Dockerfile → <code className="text-ink">Nixpacks</code> (buildpack, detecta Node/Python/Go/PHP… sozinho).</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className="label mb-1 block">Imagem Docker</label><input className="field" value={image} onChange={(e) => setImage(e.target.value)} placeholder="nginx:latest" /></div>
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div><label className="label mb-1 block">Porta interna (proxy)</label><input className="field" value={port} onChange={(e) => setPort(e.target.value)} placeholder="3000" /></div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button className="btn-brand text-sm" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Salvando…' : 'Salvar'}</button>
        {save.isSuccess && <span className="text-xs text-ok">Salvo ✓</span>}
        {save.error && <ErrorNote message={(save.error as Error).message} />}
      </div>
    </Card>
  );
}

// ── Environment ─────────────────────────────────────────────────────────
function parseEnvText(text: string): { key: string; value: string }[] {
  return text.split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const eq = line.indexOf('=');
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      return { key, value };
    })
    .filter(({ key }) => /^[A-Z_][A-Z0-9_]*$/i.test(key));
}

function EnvTab({ s }: { s: ServiceFull }) {
  const qc = useQueryClient();
  const [k, setK] = useState('');
  const [v, setV] = useState('');
  const [bulk, setBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkErr, setBulkErr] = useState('');

  const add = useMutation({
    mutationFn: () => api.post(`/services/${s.id}/env`, { key: k, value: v, isSecret: true }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['service', s.id] }); setK(''); setV(''); toast.success(`Variável adicionada.`); },
    onError: (e: unknown) => toast.error((e as Error).message),
  });
  const del = useMutation({
    mutationFn: (key: string) => api.del(`/services/${s.id}/env/${encodeURIComponent(key)}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['service', s.id] }); toast.success('Variável removida.'); },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  async function importBulk() {
    const pairs = parseEnvText(bulkText);
    if (!pairs.length) { setBulkErr('Nenhuma variável válida encontrada.'); return; }
    setBulkBusy(true); setBulkErr('');
    try {
      for (const { key, value } of pairs) {
        await api.post(`/services/${s.id}/env`, { key, value, isSecret: true });
      }
      qc.invalidateQueries({ queryKey: ['service', s.id] });
      setBulk(false);
      setBulkText('');
      toast.success(`${pairs.length} variáveis importadas.`);
    } catch (e: unknown) {
      setBulkErr(e instanceof Error ? e.message : 'Falha ao importar');
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <Card
      title="Environment"
      subtitle="Variáveis de ambiente (segredos cifrados AES-256-GCM em repouso)."
      right={
        <button onClick={() => { setBulk((b) => !b); setBulkErr(''); }} className="btn-ghost text-xs">
          {bulk ? '✕ Fechar' : 'Importar .env'}
        </button>
      }
    >
      {bulk && (
        <div className="mb-4 space-y-2 rounded-lg border border-brand/30 bg-brand/5 p-3">
          <label className="label block">Cole o conteúdo do arquivo .env</label>
          <textarea
            className="field h-36 font-mono text-xs"
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={'DATABASE_URL=postgres://...\nREDIS_URL=redis://...\nSECRET_KEY=abc123'}
            autoFocus
          />
          <div className="flex items-center gap-3">
            <button className="btn-brand text-sm" disabled={!bulkText.trim() || bulkBusy} onClick={importBulk}>
              {bulkBusy ? 'Importando…' : `Importar ${parseEnvText(bulkText).length} variáveis`}
            </button>
            {bulkErr && <span className="text-xs text-bad">{bulkErr}</span>}
          </div>
        </div>
      )}

      {s.envVars && s.envVars.length > 0 ? (
        <ul className="mb-4 divide-y divide-line">
          {s.envVars.map((e) => (
            <li key={e.key} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className="font-mono font-medium text-ink">{e.key}</span>
              <span className="flex items-center gap-3">
                <span className="font-mono text-muted">{e.value}</span>
                <button onClick={() => del.mutate(e.key)} className="text-bad hover:underline">remover</button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-muted">Nenhuma variável ainda.</p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1"><label className="label mb-1 block">Chave</label><input className="field font-mono" value={k} onChange={(e) => setK(e.target.value)} placeholder="DATABASE_URL" /></div>
        <div className="flex-1"><label className="label mb-1 block">Valor</label><input className="field font-mono" value={v} onChange={(e) => setV(e.target.value)} placeholder="postgres://…" /></div>
        <button className="btn-brand text-sm" disabled={!k || add.isPending} onClick={() => add.mutate()}>{add.isPending ? 'Salvando…' : 'Adicionar'}</button>
      </div>
      {add.error && <div className="mt-2"><ErrorNote message={(add.error as Error).message} /></div>}
    </Card>
  );
}

// ── Domains & Proxy ─────────────────────────────────────────────────────
function DomainsTab({ s }: { s: ServiceFull }) {
  const qc = useQueryClient();
  const [host, setHost] = useState('');
  const specPort = (s.spec?.port as number | undefined) ?? ((s.spec?.ports as number[] | undefined)?.[0]);
  const [port, setPort] = useState(String(specPort || 3000));
  const add = useMutation({
    mutationFn: () => api.post(`/services/${s.id}/domains`, { host, targetPort: Number(port), https: true }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['service', s.id] }); setHost(''); toast.success('Domínio adicionado.'); },
    onError: (e: unknown) => toast.error((e as Error).message),
  });
  const del = useMutation({
    mutationFn: (domainId: string) => api.del(`/services/${s.id}/domains/${domainId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['service', s.id] }); toast.success('Domínio removido.'); },
    onError: (e: unknown) => toast.error((e as Error).message),
  });
  return (
    <Card title="Domains & Proxy" subtitle="Domínios roteados pelo Traefik com HTTPS (Let's Encrypt) automático.">
      {s.domains && s.domains.length > 0 ? (
        <ul className="mb-4 divide-y divide-line">
          {s.domains.map((d) => (
            <li key={d.id} className="flex items-center justify-between py-2 text-sm">
              <a href={`${d.https ? 'https' : 'http'}://${d.host}`} target="_blank" rel="noreferrer" className="text-brand hover:underline">{d.https ? 'https://' : 'http://'}{d.host}</a>
              <span className="flex items-center gap-3 text-xs text-muted">
                <span>:{d.targetPort}</span>
                <span className="rounded bg-panel2 px-2 py-0.5">{d.certStatus}</span>
                <button onClick={() => del.mutate(d.id)} className="text-bad hover:underline">remover</button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-muted">Nenhum domínio ainda.</p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1"><label className="label mb-1 block">Domínio</label><input className="field" value={host} onChange={(e) => setHost(e.target.value)} placeholder="app.seudominio.com" /></div>
        <div className="w-28"><label className="label mb-1 block">Porta</label><input className="field" value={port} onChange={(e) => setPort(e.target.value)} /></div>
        <button className="btn-brand text-sm" disabled={!host || add.isPending} onClick={() => add.mutate()}>{add.isPending ? 'Adicionando…' : 'Adicionar'}</button>
      </div>
      {add.error && <div className="mt-3"><ErrorNote message={(add.error as Error).message} /></div>}
    </Card>
  );
}

// ── Deployments (com deploy ao vivo) ────────────────────────────────────
function DeploysTab({ s, live, onRedeploy, deploying }: { s: ServiceFull; live?: Deployment; onRedeploy: () => void; deploying: boolean }) {
  const [expandedDep, setExpandedDep] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  // Auto-scroll durante deploy ao vivo.
  useEffect(() => {
    if (logRef.current && isInflight(live?.status)) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [live?.log, live?.status]);

  const statusColor = (st: string) =>
    st === 'success' ? 'text-ok' : st === 'failed' ? 'text-bad' : 'text-warn';

  return (
    <div className="space-y-5">
      {live && (
        <Card title="Implantação atual">
          <div className="mb-2 flex items-center gap-2 text-sm">
            <span className={`font-medium ${statusColor(live.status)}`}>{live.status}</span>
            {isInflight(live.status) && <Spinner label="" />}
          </div>
          {live.log && (
            <pre ref={logRef} className="max-h-96 overflow-auto rounded-lg bg-ink p-3 font-mono text-[11px] leading-relaxed text-panel2">{live.log}</pre>
          )}
        </Card>
      )}
      <Card title="Deployments" subtitle="Histórico de implantações (manual, webhook ou API).">
        <div className="mb-3">
          <button onClick={onRedeploy} disabled={deploying} className="btn-ghost text-sm">{deploying ? 'Implantando…' : <><Icon name="rotate" className="h-4 w-4" /> Reimplantar</>}</button>
        </div>
        {s.deployments && s.deployments.length > 0 ? (
          <ul className="divide-y divide-line">
            {s.deployments.map((d) => (
              <li key={d.id}>
                <button
                  className="flex w-full items-center justify-between py-2 text-sm hover:bg-panel2/50 px-1 rounded transition-colors"
                  onClick={() => setExpandedDep((prev) => (prev === d.id ? null : d.id))}
                >
                  <span className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${d.status === 'success' ? 'bg-ok' : d.status === 'failed' ? 'bg-bad' : 'bg-warn'}`} />
                    <span className="text-ink">{d.trigger}</span>
                    {d.imageTag && <span className="font-mono text-xs text-muted">{d.imageTag}</span>}
                  </span>
                  <span className="flex items-center gap-3 text-xs text-muted">
                    <span>{new Date(d.startedAt).toLocaleString('pt-BR')}</span>
                    <span className={`rounded bg-panel2 px-2 py-0.5 ${statusColor(d.status)}`}>{d.status}</span>
                    <Icon name="chevronDown" className={`h-3.5 w-3.5 transition-transform ${expandedDep === d.id ? 'rotate-180' : ''}`} />
                  </span>
                </button>
                {expandedDep === d.id && (
                  <div className="pb-3 pt-1">
                    {d.log ? (
                      <pre className="max-h-72 overflow-auto rounded-lg bg-ink p-3 font-mono text-[11px] leading-relaxed text-panel2">{d.log}</pre>
                    ) : (
                      <p className="px-1 text-xs text-muted">Sem log registrado para este deploy.</p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="Sem implantações" hint="Configure a origem na aba Source e clique em Deploy." />
        )}
      </Card>
    </div>
  );
}

// ── Logs ────────────────────────────────────────────────────────────────
function LogsTab({ id }: { id: string }) {
  const [auto, setAuto] = useState(true);
  const logRef = useRef<HTMLPreElement>(null);
  const logs = useQuery({
    queryKey: ['service-logs', id],
    queryFn: () => api.get<{ logs?: string } | string>(`/services/${id}/logs?tail=400`),
    refetchInterval: auto ? 3000 : false,
    retry: false,
  });
  const text = typeof logs.data === 'string' ? logs.data : logs.data?.logs;

  // Auto-scroll para a última linha quando a atualização automática está ligada.
  useEffect(() => {
    if (logRef.current && auto) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [text, auto]);

  return (
    <Card title="Logs" subtitle="Saída do container (stdout/stderr).">
      <div className="mb-3 flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> auto-atualizar (3s)
        </label>
        <button onClick={() => logs.refetch()} className="btn-ghost text-xs">Atualizar agora</button>
      </div>
      {logs.isLoading ? <Spinner /> : logs.error ? <ErrorNote message={(logs.error as Error).message} /> : text ? (
        <pre ref={logRef} className="max-h-[28rem] overflow-auto rounded-lg bg-ink p-3 font-mono text-[11px] leading-relaxed text-panel2">{text}</pre>
      ) : (
        <Empty title="Sem logs" hint="Este serviço ainda não produziu saída." />
      )}
    </Card>
  );
}

// ── Agendamento de liga/desliga ──────────────────────────────────────────
interface ScheduleInfo { startTime: string | null; stopTime: string | null; enabled: boolean }
function ScheduleCard({ containerName }: { containerName: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['schedule', containerName],
    queryFn: () => api.get<ScheduleInfo>(`/servers/local/containers/${encodeURIComponent(containerName)}/schedule`),
  });
  const sched = q.data;
  const [start, setStart] = useState('');
  const [stop, setStop] = useState('');
  useEffect(() => { if (sched) { setStart(sched.startTime ?? ''); setStop(sched.stopTime ?? ''); } }, [sched]);

  const save = useMutation({
    mutationFn: () =>
      api.put(`/servers/local/containers/${encodeURIComponent(containerName)}/schedule`, {
        startTime: start || null,
        stopTime: stop || null,
        enabled: true,
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule', containerName] }); toast.success('Agendamento salvo.'); },
    onError: (e: unknown) => toast.error((e as Error).message),
  });
  const clear = useMutation({
    mutationFn: () => api.del(`/servers/local/containers/${encodeURIComponent(containerName)}/schedule`),
    onSuccess: () => { setStart(''); setStop(''); qc.invalidateQueries({ queryKey: ['schedule', containerName] }); toast.success('Agendamento removido.'); },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  return (
    <Card
      title="Agendamento"
      subtitle="Liga e desliga o container automaticamente por horário diário (HH:MM, horário do servidor)."
    >
      {q.isLoading ? <Spinner /> : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label mb-1 block">Ligar às</label>
              <input className="field" type="time" value={start} onChange={(e) => setStart(e.target.value)} placeholder="08:00" />
              <p className="mt-1 text-xs text-muted">Vazio = não liga automaticamente</p>
            </div>
            <div>
              <label className="label mb-1 block">Desligar às</label>
              <input className="field" type="time" value={stop} onChange={(e) => setStop(e.target.value)} placeholder="22:00" />
              <p className="mt-1 text-xs text-muted">Vazio = não desliga automaticamente</p>
            </div>
          </div>
          {sched?.enabled && (sched.startTime || sched.stopTime) && (
            <div className="flex items-center gap-2 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-xs text-muted">
              <Icon name="history" className="h-3.5 w-3.5 text-brand" />
              Agendamento ativo: {sched.startTime ? `liga às ${sched.startTime}` : ''}{sched.startTime && sched.stopTime ? ' · ' : ''}{sched.stopTime ? `desliga às ${sched.stopTime}` : ''}
            </div>
          )}
          <div className="flex items-center gap-3">
            <button className="btn-brand text-sm" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? 'Salvando…' : 'Salvar agendamento'}
            </button>
            {(sched?.startTime || sched?.stopTime) && (
              <button className="btn-ghost text-sm text-bad" disabled={clear.isPending} onClick={() => clear.mutate()}>
                {clear.isPending ? '…' : 'Remover agendamento'}
              </button>
            )}
            {save.isSuccess && <span className="text-xs text-ok">Salvo ✓</span>}
            {(save.error || clear.error) && <ErrorNote message={((save.error || clear.error) as Error).message} />}
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Advanced (webhook + danger zone) ────────────────────────────────────
function AdvancedTab({ s, onDestroy, destroying }: { s: ServiceFull; onDestroy: () => void; destroying: boolean }) {
  const [webhook, setWebhook] = useState<string | null>(null);
  const [confirm, setConfirm] = useState('');
  const gen = useMutation({
    mutationFn: () => api.post<WebhookInfo>(`/services/${s.id}/webhook`),
    onSuccess: (r) => { setWebhook(r.url); toast.success('URL do webhook gerada.'); },
    onError: (e: unknown) => toast.error((e as Error).message),
  });
  return (
    <div className="space-y-5">
      <Card title="Deploy Webhook" subtitle="Cole no GitHub/GitLab — cada push dispara um deploy automático (CI/CD).">
        <button className="btn-brand text-sm" disabled={gen.isPending} onClick={() => gen.mutate()}>{gen.isPending ? 'Gerando…' : webhook ? 'Gerar nova URL' : 'Gerar URL do webhook'}</button>
        {webhook && (
          <div className="mt-3">
            <div className="flex items-center gap-2">
              <input readOnly value={webhook} className="field font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <button className="btn-ghost text-xs" onClick={() => { navigator.clipboard?.writeText(webhook); toast.success('URL copiada.'); }}>Copiar</button>
            </div>
            <p className="mt-2 text-xs text-muted">Método <code className="text-ink">POST</code>. Gerar uma nova URL invalida a anterior.</p>
          </div>
        )}
      </Card>

      {s.containerId && <ScheduleCard containerName={s.containerId} />}

      <LimitsCard s={s} />

      <Card title="Zona de perigo">
        <p className="mb-3 text-sm text-muted">Remover o serviço apaga o container e todo o registro. Não tem volta.</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1">
            <label className="label mb-1 block">Digite <span className="font-mono text-ink">{s.name}</span> para confirmar</label>
            <input className="field" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={s.name} />
          </div>
          <button
            onClick={onDestroy}
            disabled={confirm !== s.name || destroying}
            className="inline-flex items-center gap-2 rounded-lg border border-bad/50 px-4 py-2 text-sm font-medium text-bad transition-colors hover:bg-bad/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {destroying ? 'Removendo…' : <><Icon name="trash" className="h-4 w-4" /> Remover serviço</>}
          </button>
        </div>
      </Card>
    </div>
  );
}

// ── Limites de recursos (CPU / RAM / PIDs) ──────────────────────────────
// Tetos por container — protegem o servidor contra abuso. Vazio = usa o padrão
// da instância. Salvo em spec.limits e aplicado pelo deploy no próximo build.
function LimitsCard({ s }: { s: ServiceFull }) {
  const qc = useQueryClient();
  const lim = ((s.spec as Record<string, unknown>)?.limits ?? {}) as {
    memMb?: number;
    cpus?: number;
    pidsLimit?: number;
  };
  const [mem, setMem] = useState(lim.memMb ? String(lim.memMb) : '');
  const [cpus, setCpus] = useState(lim.cpus ? String(lim.cpus) : '');
  const [pids, setPids] = useState(lim.pidsLimit ? String(lim.pidsLimit) : '');
  const save = useMutation({
    mutationFn: () =>
      api.patch(`/services/${s.id}`, {
        spec: {
          limits: {
            memMb: mem ? Number(mem) : undefined,
            cpus: cpus ? Number(cpus) : undefined,
            pidsLimit: pids ? Number(pids) : undefined,
          },
        },
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['service', s.id] }); toast.success('Limites salvos — valem no próximo deploy.'); },
    onError: (e: unknown) => toast.error((e as Error).message),
  });
  return (
    <Card
      title="Limites de recursos"
      subtitle="Tetos por container — protegem o servidor contra abuso (CPU/RAM, fork-bomb). Deixe vazio para usar o padrão da instância."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label mb-1 block">RAM máx (MB)</label>
          <input className="field" inputMode="numeric" value={mem} onChange={(e) => setMem(e.target.value)} placeholder="1024 (padrão)" />
        </div>
        <div>
          <label className="label mb-1 block">CPU (vCPUs)</label>
          <input className="field" inputMode="decimal" value={cpus} onChange={(e) => setCpus(e.target.value)} placeholder="1 (padrão)" />
        </div>
        <div>
          <label className="label mb-1 block">Processos (PIDs)</label>
          <input className="field" inputMode="numeric" value={pids} onChange={(e) => setPids(e.target.value)} placeholder="512 (padrão)" />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button className="btn-brand text-sm" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Salvando…' : 'Salvar limites'}
        </button>
        {save.isSuccess && <span className="text-xs text-ok">Salvo ✓ — vale no próximo deploy</span>}
        {save.error && <ErrorNote message={(save.error as Error).message} />}
      </div>
    </Card>
  );
}

// ── Métricas (gráficos de histórico CPU/RAM/rede) ───────────────────────
type MetricSample = { t: number; cpuPct: number; memBytes: number; netInBps: number; netOutBps: number };

function fmtBytes(n: number) {
  if (!n || n < 1) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}
const fmtBps = (n: number) => `${fmtBytes(n)}/s`;

// Gráfico de área SVG leve (sem lib) — preenche a largura do card.
function AreaChart({ data, color }: { data: number[]; color: string }) {
  const W = 300, H = 70, P = 4;
  if (data.length < 2) {
    return <div className="flex h-[70px] items-center justify-center text-xs text-muted">coletando…</div>;
  }
  const max = Math.max(...data, 1);
  const stepX = (W - P * 2) / (data.length - 1);
  const pts = data.map((v, i) => [P + i * stepX, H - P - (v / max) * (H - P * 2)] as const);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${H} L${pts[0][0].toFixed(1)},${H} Z`;
  const gid = `mc-${color.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[70px] w-full">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function MetricChart({ label, value, data, color }: { label: string; value: string; data: number[]; color: string }) {
  return (
    <div className="plate-2 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="label">{label}</span>
        <span className="font-display text-lg font-semibold tabular-nums text-ink">{value}</span>
      </div>
      <div className="mt-2"><AreaChart data={data} color={color} /></div>
    </div>
  );
}

function MetricsTab({ id }: { id: string }) {
  const q = useQuery({
    queryKey: ['metrics-history', id],
    queryFn: () => api.get<{ samples: MetricSample[] }>(`/services/${id}/metrics-history`),
    refetchInterval: 10000,
  });
  const samples = q.data?.samples ?? [];
  const last = samples[samples.length - 1];
  return (
    <Card title="Métricas" subtitle="Histórico de uso do container — amostrado a cada 20s (última ~1 hora).">
      {samples.length < 2 ? (
        <Empty title="Sem dados ainda" hint="O serviço precisa estar no ar; os gráficos aparecem após alguns ciclos de coleta." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricChart label="CPU" value={`${(last?.cpuPct ?? 0).toFixed(1)} %`} data={samples.map((s) => s.cpuPct)} color="rgb(16 185 129)" />
          <MetricChart label="Memória" value={fmtBytes(last?.memBytes ?? 0)} data={samples.map((s) => s.memBytes)} color="rgb(59 130 246)" />
          <MetricChart label="Rede ↓↑" value={`${fmtBps(last?.netInBps ?? 0)} · ${fmtBps(last?.netOutBps ?? 0)}`} data={samples.map((s) => s.netInBps + s.netOutBps)} color="rgb(168 85 247)" />
        </div>
      )}
    </Card>
  );
}
