import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import { toast } from '../lib/toast';
import { Icon } from '../components/icons';

// ─── types ────────────────────────────────────────────────────────────────────
interface PortEntry {
  port: number; proto: string; pid: number | null;
  process: string | null; state: string; addr: string;
}
interface DiskEntry { path: string; size: string; bytes: number }
interface CronEntry { raw: string; schedule: string; command: string; user?: string }
interface EnvEntry { key: string; value: string; comment: boolean; masked?: boolean }

// ─── Tab bar ──────────────────────────────────────────────────────────────────
type Tab = 'ports' | 'disk' | 'env' | 'crons' | 'health';

interface HealthCheck {
  port: number; process: string | null; pid: number | null;
  httpStatus: number; ms: number; ok: boolean;
}

const TABS: { id: Tab; label: string; icon: 'globe' | 'server' | 'book' | 'history' | 'shield' }[] = [
  { id: 'health', label: 'Health',     icon: 'shield' },
  { id: 'ports',  label: 'Port Map',   icon: 'globe' },
  { id: 'disk',   label: 'Disk Usage', icon: 'server' },
  { id: 'env',    label: 'Env Editor', icon: 'book' },
  { id: 'crons',  label: 'Cron Jobs',  icon: 'history' },
];

// ─── Port Map ─────────────────────────────────────────────────────────────────
function PortMap() {
  const [q, setQ] = useState('');
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['tools-ports'],
    queryFn: () => api.get<{ ports: PortEntry[] }>('/tools/ports'),
    refetchInterval: 15_000,
  });

  const ports = (data?.ports ?? []).filter((p) =>
    !q || String(p.port).includes(q) || (p.process ?? '').toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filtrar por porta ou processo…"
          className="flex-1 rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand/50 focus:outline-none"
        />
        <button onClick={() => refetch()}
          className="rounded-lg border border-line px-3 py-2 text-sm text-muted hover:bg-panel2">
          <Icon name="refresh" className="h-4 w-4" />
        </button>
        <span className="text-sm text-muted">{ports.length} portas</span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        </div>
      ) : ports.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted">Nenhuma porta encontrada</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-panel2">
              <tr>
                {['Porta', 'Proto', 'Estado', 'Processo', 'PID', 'Endereço'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ports.map((p) => (
                <tr key={`${p.proto}-${p.port}`} className="hover:bg-panel2/50 transition-colors">
                  <td className="px-4 py-2.5 font-mono font-semibold text-brand tabular-nums">{p.port}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      p.proto === 'tcp' ? 'bg-ok/10 text-ok border border-ok/30' : 'bg-brand/10 text-brand border border-brand/30'
                    }`}>{p.proto.toUpperCase()}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs ${p.state === 'LISTEN' ? 'text-ok' : 'text-muted'}`}>{p.state}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-ink">{p.process ?? <span className="text-muted">—</span>}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted tabular-nums">{p.pid ?? '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-muted">{p.addr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Disk Usage ───────────────────────────────────────────────────────────────
function DiskUsage() {
  const [dir, setDir] = useState('/var/www');
  const [input, setInput] = useState('/var/www');
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['tools-disk', dir],
    queryFn: () => api.get<{ entries: DiskEntry[] }>(`/tools/disk?dir=${encodeURIComponent(dir)}`),
  });

  const entries = data?.entries ?? [];
  const maxBytes = entries[0]?.bytes ?? 1;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') setDir(input); }}
          placeholder="/var/www"
          className="flex-1 rounded-lg border border-line bg-panel2 px-3 py-2 font-mono text-sm text-ink placeholder:text-muted focus:border-brand/50 focus:outline-none"
        />
        <button onClick={() => { setDir(input); refetch(); }}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90">
          Analisar
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        </div>
      ) : entries.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted">Nenhum dado encontrado para {dir}</div>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => {
            const pct = (e.bytes / maxBytes) * 100;
            return (
              <div key={e.path} className="rounded-xl border border-line bg-panel p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span
                    className="cursor-pointer truncate font-mono text-xs text-ink hover:text-brand"
                    onClick={() => { setInput(e.path.replace(/\/$/, '')); setDir(e.path.replace(/\/$/, '')); }}
                    title="Clicar para detalhar"
                  >
                    {e.path}
                  </span>
                  <span className="shrink-0 font-semibold text-ink tabular-nums">{e.size}</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-panel2">
                  <div
                    className={`h-full rounded-full transition-all ${pct > 80 ? 'bg-bad' : pct > 50 ? 'bg-warn' : 'bg-ok'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Env Editor ───────────────────────────────────────────────────────────────
function EnvEditor() {
  const [pathInput, setPathInput] = useState('');
  const [loadedPath, setLoadedPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<EnvEntry[]>([]);
  const [showSecrets, setShowSecrets] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useQuery({
    queryKey: ['tools-env', loadedPath],
    queryFn: () => api.get<{ entries: EnvEntry[] }>(`/tools/env?path=${encodeURIComponent(loadedPath!)}`),
    enabled: !!loadedPath,
  });

  useEffect(() => {
    if (load.data) { setEntries(load.data.entries); setDirty(false); }
  }, [load.data]);

  const save = useMutation({
    mutationFn: () => api.put('/tools/env', { path: loadedPath, entries }),
    onSuccess: () => { toast.success('.env salvo'); setDirty(false); },
    onError: (e) => toast.error((e as Error).message),
  });

  function updateEntry(idx: number, key: string, value: string) {
    setEntries((prev) => prev.map((e, i) => i === idx ? { ...e, key, value } : e));
    setDirty(true);
  }

  function addEntry() {
    setEntries((prev) => [...prev, { key: 'NOVA_VAR', value: '', comment: false }]);
    setDirty(true);
  }

  function removeEntry(idx: number) {
    setEntries((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') setLoadedPath(pathInput); }}
          placeholder="/var/www/meu-projeto"
          className="flex-1 rounded-lg border border-line bg-panel2 px-3 py-2 font-mono text-sm text-ink placeholder:text-muted focus:border-brand/50 focus:outline-none"
        />
        <button onClick={() => setLoadedPath(pathInput)}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90">
          Carregar .env
        </button>
      </div>

      {load.isLoading && (
        <div className="flex justify-center py-12">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        </div>
      )}

      {entries.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-ink">{loadedPath}/.env</span>
              {dirty && <span className="rounded-full border border-warn/30 bg-warn/10 px-2 py-0.5 text-[11px] text-warn">alterado</span>}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSecrets((s) => !s)}
                className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:bg-panel2"
              >
                <Icon name={showSecrets ? 'book' : 'settings'} className="h-3.5 w-3.5" />
                {showSecrets ? 'Ocultar segredos' : 'Mostrar segredos'}
              </button>
              <button onClick={addEntry}
                className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:bg-panel2">
                <Icon name="plus" className="h-3.5 w-3.5" /> Adicionar
              </button>
              <button
                onClick={() => save.mutate()}
                disabled={!dirty || save.isPending}
                className="rounded-lg bg-brand px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand/90 disabled:opacity-40"
              >
                {save.isPending ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            {entries.map((e, idx) => {
              if (e.comment) {
                return (
                  <div key={idx} className="rounded-lg bg-panel2/50 px-3 py-1.5 font-mono text-[12px] text-muted">
                    {e.value}
                  </div>
                );
              }
              const isSecret = e.masked && !showSecrets;
              return (
                <div key={idx} className="flex items-center gap-2 rounded-lg border border-line bg-panel p-2">
                  <input
                    value={e.key}
                    onChange={(ev) => updateEntry(idx, ev.target.value, e.value)}
                    className="w-48 shrink-0 rounded border border-line bg-panel2 px-2 py-1 font-mono text-[12px] text-ink focus:border-brand/50 focus:outline-none"
                  />
                  <span className="text-muted">=</span>
                  <input
                    type={isSecret ? 'password' : 'text'}
                    value={e.value}
                    onChange={(ev) => updateEntry(idx, e.key, ev.target.value)}
                    className="flex-1 rounded border border-line bg-panel2 px-2 py-1 font-mono text-[12px] text-ink focus:border-brand/50 focus:outline-none"
                    placeholder="valor"
                  />
                  {e.masked && (
                    <span className="shrink-0 rounded border border-warn/30 bg-warn/10 px-1.5 text-[10px] text-warn">secret</span>
                  )}
                  <button onClick={() => removeEntry(idx)} className="text-muted hover:text-bad transition-colors">
                    <Icon name="trash" className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Cron Jobs ────────────────────────────────────────────────────────────────
function CronJobs() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['tools-crons'],
    queryFn: () => api.get<{ crons: CronEntry[] }>('/tools/crons'),
  });
  const crons = data?.crons ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">{crons.length} tarefas agendadas</span>
        <button onClick={() => refetch()}
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-panel2">
          <Icon name="refresh" className="h-4 w-4" />
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        </div>
      ) : crons.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted">Nenhuma tarefa cron encontrada</div>
      ) : (
        <div className="space-y-2">
          {crons.map((c, i) => (
            <div key={i} className="rounded-xl border border-line bg-panel p-4">
              <div className="flex flex-wrap items-start gap-3">
                <code className="shrink-0 rounded-lg border border-brand/20 bg-brand/5 px-3 py-1.5 font-mono text-[12px] text-brand">
                  {c.schedule}
                </code>
                {c.user && (
                  <span className="rounded-full border border-line bg-panel2 px-2 py-0.5 text-[11px] text-muted">
                    {c.user}
                  </span>
                )}
              </div>
              <div className="mt-2 font-mono text-[12px] text-ink break-all">
                {c.command}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Health Monitor ──────────────────────────────────────────────────────────
function HealthMonitor() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['tools-health'],
    queryFn: () => api.get<{ checks: HealthCheck[] }>('/tools/health'),
    refetchInterval: 30_000,
  });

  const checks = data?.checks ?? [];
  const ok = checks.filter((c) => c.ok).length;
  const fail = checks.filter((c) => !c.ok).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-sm">
          {ok > 0 && (
            <span className="flex items-center gap-1.5 text-ok">
              <span className="h-2 w-2 rounded-full bg-ok" /> {ok} saudável(is)
            </span>
          )}
          {fail > 0 && (
            <span className="flex items-center gap-1.5 text-bad">
              <span className="h-2 w-2 rounded-full bg-bad" /> {fail} com falha
            </span>
          )}
          {checks.length === 0 && !isLoading && (
            <span className="text-muted">Nenhuma porta HTTP encontrada</span>
          )}
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-panel2 disabled:opacity-50"
        >
          <Icon name="refresh" className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-2">
          {checks.map((c) => (
            <div
              key={c.port}
              className={`flex items-center gap-4 rounded-xl border p-4 transition-colors ${
                c.ok ? 'border-ok/20 bg-ok/5' : c.httpStatus === 0 ? 'border-bad/20 bg-bad/5' : 'border-warn/20 bg-warn/5'
              }`}
            >
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold ${
                c.ok ? 'bg-ok/20 text-ok' : c.httpStatus === 0 ? 'bg-bad/20 text-bad' : 'bg-warn/20 text-warn'
              }`}>
                {c.httpStatus === 0 ? '✕' : c.httpStatus}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-ink">:{c.port}</span>
                  {c.process && (
                    <span className="rounded border border-line bg-panel2 px-1.5 py-0.5 text-[11px] text-muted">
                      {c.process}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted">
                  {c.httpStatus === 0 ? 'Sem resposta HTTP' : `HTTP ${c.httpStatus}`}
                  {c.pid && ` · PID ${c.pid}`}
                </div>
              </div>
              <div className={`text-right font-mono text-sm tabular-nums ${
                c.ms < 100 ? 'text-ok' : c.ms < 500 ? 'text-warn' : 'text-bad'
              }`}>
                {c.ms}ms
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export function Tools() {
  const [tab, setTab] = useState<Tab>('health');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-ink">Ferramentas</h2>
        <p className="mt-0.5 text-sm text-muted">
          Health check, port map, uso de disco, editor de .env e cron jobs
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-xl border border-line bg-panel p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={[
              'flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              tab === t.id
                ? 'bg-brand/10 text-ink ring-1 ring-inset ring-brand/25'
                : 'text-muted hover:bg-panel2 hover:text-ink',
            ].join(' ')}
          >
            <Icon name={t.icon} className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'health' && <HealthMonitor />}
      {tab === 'ports' && <PortMap />}
      {tab === 'disk'  && <DiskUsage />}
      {tab === 'env'   && <EnvEditor />}
      {tab === 'crons' && <CronJobs />}
    </div>
  );
}
