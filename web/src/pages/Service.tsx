import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Deployment, type DeployStart, type ServiceFull, type WebhookInfo } from '../lib/api';
import { Card } from '../components/Card';
import { StatusDot } from '../components/StatusDot';
import { TypeBadge } from '../components/badges';
import { Icon } from '../components/icons';
import { Spinner, ErrorNote, Empty } from '../components/ui';

const TERMINAL = ['success', 'failed'];
const isInflight = (st?: string) => !!st && !TERMINAL.includes(st);

// Abas no padrão do EasyPanel (Source · Environment · Domains · Deployments · Logs · Advanced).
type Tab = 'source' | 'env' | 'domains' | 'deploys' | 'logs' | 'advanced';

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
    if (st && TERMINAL.includes(st)) qc.invalidateQueries({ queryKey: ['service', id] });
  }, [depQ.data?.status, id, qc]);
  // Se já houver um deploy em andamento ao abrir a página, retoma o acompanhamento.
  useEffect(() => {
    const running = svc.data?.deployments?.find((d) => isInflight(d.status));
    if (running && !activeDep) { setActiveDep(running.id); setTab('deploys'); }
  }, [svc.data, activeDep]);

  const deploy = useMutation({
    mutationFn: () => api.post<DeployStart>(`/services/${id}/deploy`),
    onSuccess: (r) => { setActiveDep(r.deploymentId); setTab('deploys'); },
  });
  const lifecycle = useMutation({
    mutationFn: (action: 'start' | 'stop' | 'restart') => api.post(`/services/${id}/${action}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service', id] }),
  });
  const destroy = useMutation({
    mutationFn: () => api.del(`/services/${id}`),
    onSuccess: () => navigate(svc.data?.project ? `/project/${svc.data.project.id}` : '/'),
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
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-semibold text-ink">{s.name}</h1>
              <TypeBadge type={s.type} spec={s.spec} />
            </div>
            <div className="mt-0.5"><StatusDot state={deploying ? 'restarting' : s.status} withLabel /></div>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
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
            ) : (
              <button onClick={() => lifecycle.mutate('start')} disabled={lifecycle.isPending || !s.containerId} className="btn-ghost text-sm"><Icon name="play" className="h-4 w-4" /> Start</button>
            )}
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service', s.id] }),
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
function EnvTab({ s }: { s: ServiceFull }) {
  const qc = useQueryClient();
  const [k, setK] = useState('');
  const [v, setV] = useState('');
  const add = useMutation({
    mutationFn: () => api.post(`/services/${s.id}/env`, { key: k, value: v, isSecret: true }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['service', s.id] }); setK(''); setV(''); },
  });
  const del = useMutation({
    mutationFn: (key: string) => api.del(`/services/${s.id}/env/${encodeURIComponent(key)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service', s.id] }),
  });
  return (
    <Card title="Environment" subtitle="Variáveis de ambiente (segredos cifrados AES-256-GCM em repouso).">
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
    </Card>
  );
}

// ── Domains & Proxy ─────────────────────────────────────────────────────
function DomainsTab({ s }: { s: ServiceFull }) {
  const qc = useQueryClient();
  const [host, setHost] = useState('');
  const [port, setPort] = useState('3000');
  const add = useMutation({
    mutationFn: () => api.post(`/services/${s.id}/domains`, { host, targetPort: Number(port), https: true }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['service', s.id] }); setHost(''); },
  });
  const del = useMutation({
    mutationFn: (domainId: string) => api.del(`/services/${s.id}/domains/${domainId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service', s.id] }),
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
            <pre className="max-h-96 overflow-auto rounded-lg bg-ink p-3 font-mono text-[11px] leading-relaxed text-panel2">{live.log}</pre>
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
              <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                <span className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${d.status === 'success' ? 'bg-ok' : d.status === 'failed' ? 'bg-bad' : 'bg-warn'}`} />
                  <span className="text-ink">{d.trigger}</span>
                  {d.imageTag && <span className="font-mono text-xs text-muted">{d.imageTag}</span>}
                </span>
                <span className="flex items-center gap-3 text-xs text-muted">
                  <span>{new Date(d.startedAt).toLocaleString('pt-BR')}</span>
                  <span className={`rounded bg-panel2 px-2 py-0.5 ${statusColor(d.status)}`}>{d.status}</span>
                </span>
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
  const logs = useQuery({
    queryKey: ['service-logs', id],
    queryFn: () => api.get<{ logs?: string } | string>(`/services/${id}/logs?tail=400`),
    refetchInterval: auto ? 3000 : false,
    retry: false,
  });
  const text = typeof logs.data === 'string' ? logs.data : logs.data?.logs;
  return (
    <Card title="Logs" subtitle="Saída do container (stdout/stderr).">
      <div className="mb-3 flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> auto-atualizar (3s)
        </label>
        <button onClick={() => logs.refetch()} className="btn-ghost text-xs">Atualizar agora</button>
      </div>
      {logs.isLoading ? <Spinner /> : logs.error ? <ErrorNote message={(logs.error as Error).message} /> : text ? (
        <pre className="max-h-[28rem] overflow-auto rounded-lg bg-ink p-3 font-mono text-[11px] leading-relaxed text-panel2">{text}</pre>
      ) : (
        <Empty title="Sem logs" hint="Este serviço ainda não produziu saída." />
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
    onSuccess: (r) => setWebhook(r.url),
  });
  return (
    <div className="space-y-5">
      <Card title="Deploy Webhook" subtitle="Cole no GitHub/GitLab — cada push dispara um deploy automático (CI/CD).">
        <button className="btn-brand text-sm" disabled={gen.isPending} onClick={() => gen.mutate()}>{gen.isPending ? 'Gerando…' : webhook ? 'Gerar nova URL' : 'Gerar URL do webhook'}</button>
        {webhook && (
          <div className="mt-3">
            <div className="flex items-center gap-2">
              <input readOnly value={webhook} className="field font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <button className="btn-ghost text-xs" onClick={() => navigator.clipboard?.writeText(webhook)}>Copiar</button>
            </div>
            <p className="mt-2 text-xs text-muted">Método <code className="text-ink">POST</code>. Gerar uma nova URL invalida a anterior.</p>
          </div>
        )}
      </Card>

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
