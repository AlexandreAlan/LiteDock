import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type ServiceFull } from '../lib/api';
import { Card } from '../components/Card';
import { StatusDot } from '../components/StatusDot';
import { TypeBadge } from '../components/badges';
import { Spinner, ErrorNote, Empty } from '../components/ui';

function GuardBtn({ label, danger }: { label: string; danger?: boolean }) {
  return (
    <button
      disabled
      title="Modo seguro — ações de deploy desativadas"
      className={`inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium opacity-60 ${
        danger ? 'border-bad/40 text-bad' : 'border-line text-ink'
      }`}
    >
      {label}
    </button>
  );
}

export function Service() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const svc = useQuery({ queryKey: ['service', id], queryFn: () => api.get<ServiceFull>(`/services/${id}`) });
  const [showLogs, setShowLogs] = useState(false);
  const logs = useQuery({
    queryKey: ['service-logs', id],
    queryFn: () => api.get<{ logs?: string } | string>(`/services/${id}/logs`),
    enabled: showLogs,
    retry: false,
  });

  // env
  const [ek, setEk] = useState('');
  const [ev, setEv] = useState('');
  const addEnv = useMutation({
    mutationFn: () => api.post(`/services/${id}/env`, { key: ek, value: ev, isSecret: true }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['service', id] }); setEk(''); setEv(''); },
  });
  const delEnv = useMutation({
    mutationFn: (key: string) => api.del(`/services/${id}/env/${encodeURIComponent(key)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service', id] }),
  });

  // domains
  const [host, setHost] = useState('');
  const [port, setPort] = useState('3000');
  const addDomain = useMutation({
    mutationFn: () => api.post(`/services/${id}/domains`, { host, targetPort: Number(port), https: true }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['service', id] }); setHost(''); },
  });

  // source tabs (app)
  const [srcTab, setSrcTab] = useState<'github' | 'docker'>('github');

  if (svc.isLoading) return <Spinner label="loading service…" />;
  if (svc.error) return <ErrorNote message={(svc.error as Error).message} />;
  const s = svc.data!;
  const isApp = s.type === 'app';
  const logText = typeof logs.data === 'string' ? logs.data : logs.data?.logs;

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
        <div className="mb-3 flex items-center gap-2">
          <h1 className="text-xl font-semibold text-ink">{s.name}</h1>
          <TypeBadge type={s.type} spec={s.spec} />
          <span className="ml-1"><StatusDot state={s.status} withLabel /></span>
        </div>
        <div className="flex flex-wrap gap-2">
          {isApp ? (
            <>
              <button disabled title="Modo seguro" className="cursor-not-allowed rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white opacity-60">Deploy</button>
              <GuardBtn label="Force Rebuild" />
              <button onClick={() => setShowLogs((v) => !v)} className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-panel2">Logs</button>
              <GuardBtn label="Console" />
              <GuardBtn label="Destroy" danger />
            </>
          ) : (
            <>
              <GuardBtn label="Disable" />
              <button onClick={() => setShowLogs((v) => !v)} className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-panel2">Logs</button>
              <GuardBtn label="Console" />
              <GuardBtn label="Destroy" danger />
            </>
          )}
        </div>
      </div>

      {/* logs console */}
      {showLogs && (
        <Card title="Logs">
          {logs.isLoading ? <Spinner /> : logText ? (
            <pre className="max-h-80 overflow-auto rounded-lg bg-ink p-3 font-mono text-[11px] leading-relaxed text-panel2">{logText}</pre>
          ) : (
            <Empty title="No logs" hint="This service hasn't produced output yet." />
          )}
        </Card>
      )}

      {/* Source (app) */}
      {isApp && (
        <Card title="Source">
          <div className="mb-4 inline-flex rounded-lg border border-line p-1">
            {(['github', 'docker'] as const).map((t) => (
              <button key={t} onClick={() => setSrcTab(t)} className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${srcTab === t ? 'bg-panel2 text-ink' : 'text-muted hover:text-ink'}`}>
                {t === 'github' ? 'Github' : 'Docker Image'}
              </button>
            ))}
          </div>
          {srcTab === 'github' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="label mb-1 block">Owner</label><input className="field" placeholder="owner" /></div>
              <div><label className="label mb-1 block">Repository</label><input className="field" placeholder="repo" /></div>
              <div><label className="label mb-1 block">Branch</label><input className="field" defaultValue="main" /></div>
              <div><label className="label mb-1 block">Build Path</label><input className="field" defaultValue="/" /></div>
            </div>
          ) : (
            <div><label className="label mb-1 block">Image</label><input className="field" placeholder="nginx:latest" /></div>
          )}
          <div className="mt-4">
            <button disabled title="Modo seguro" className="cursor-not-allowed rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white opacity-60">Save</button>
          </div>
        </Card>
      )}

      {/* Environment */}
      <Card title="Environment">
        {s.envVars && s.envVars.length > 0 ? (
          <ul className="mb-4 divide-y divide-line">
            {s.envVars.map((e) => (
              <li key={e.key} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="font-medium text-ink">{e.key}</span>
                <span className="flex items-center gap-3">
                  <span className="text-muted">{e.value}</span>
                  <button onClick={() => delEnv.mutate(e.key)} className="text-bad hover:underline">remove</button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-muted">No environment variables yet.</p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1"><label className="label mb-1 block">Key</label><input className="field" value={ek} onChange={(e) => setEk(e.target.value)} placeholder="DATABASE_URL" /></div>
          <div className="flex-1"><label className="label mb-1 block">Value</label><input className="field" value={ev} onChange={(e) => setEv(e.target.value)} placeholder="postgres://…" /></div>
          <button className="btn-brand" disabled={!ek || addEnv.isPending} onClick={() => addEnv.mutate()}>{addEnv.isPending ? 'Saving…' : 'Add'}</button>
        </div>
      </Card>

      {/* Domains */}
      <Card title="Domains">
        {s.domains && s.domains.length > 0 ? (
          <ul className="mb-4 divide-y divide-line">
            {s.domains.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink">{d.https ? 'https://' : 'http://'}{d.host}</span>
                <span className="text-xs text-muted">:{d.targetPort} · {d.certStatus}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-muted">No domains yet.</p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1"><label className="label mb-1 block">Host</label><input className="field" value={host} onChange={(e) => setHost(e.target.value)} placeholder="app.seudominio.com" /></div>
          <div className="w-28"><label className="label mb-1 block">Port</label><input className="field" value={port} onChange={(e) => setPort(e.target.value)} /></div>
          <button className="btn-brand" disabled={!host || addDomain.isPending} onClick={() => addDomain.mutate()}>{addDomain.isPending ? 'Adding…' : 'Add'}</button>
        </div>
      </Card>

      {/* Deployments */}
      <Card title="Deployments">
        {s.deployments && s.deployments.length > 0 ? (
          <ul className="divide-y divide-line">
            {s.deployments.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink">{d.trigger}</span>
                <span className="flex items-center gap-3 text-xs text-muted">
                  <span>{new Date(d.startedAt).toLocaleString('pt-BR')}</span>
                  <span className="rounded bg-panel2 px-2 py-0.5">{d.status}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No deployments yet.</p>
        )}
      </Card>
    </div>
  );
}
