// Visão Geral — snapshot unificado de todos os serviços PM2 + Docker na VPS.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { toast } from '../lib/toast';
import { Icon } from '../components/icons';
import { MetricsBar } from '../components/MetricsBar';

// ─── tipos ────────────────────────────────────────────────────────────────────
interface Pm2Item {
  kind: 'pm2'; name: string; status: string;
  cpu: number; memory: number; uptime: number | null; restarts: number;
  cwd: string; ports: number[];
}
interface DockerItem {
  kind: 'docker'; name: string; image: string;
  status: string; managed: boolean; ports: number[];
}
type ServiceItem = Pm2Item | DockerItem;
interface ImportResult { imported: number; skipped: number; errors: string[] }

// ─── helpers ─────────────────────────────────────────────────────────────────
function fmtMem(b: number) {
  if (!b) return '—';
  return b < 1_048_576 ? `${(b / 1024).toFixed(0)}KB` : `${(b / 1_048_576).toFixed(1)}MB`;
}
function fmtUptime(ts: number | null) {
  if (!ts) return '—';
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return `${s.toFixed(0)}s`;
  if (s < 3600) return `${(s / 60).toFixed(0)}m`;
  if (s < 86400) return `${(s / 3600).toFixed(1)}h`;
  return `${(s / 86400).toFixed(1)}d`;
}
const PM2_STATUS: Record<string, { dot: string; label: string }> = {
  online:   { dot: 'bg-ok animate-pulse',    label: 'online' },
  stopped:  { dot: 'bg-muted/40',            label: 'parado' },
  errored:  { dot: 'bg-bad',                 label: 'erro' },
  stopping: { dot: 'bg-warn',                label: 'parando' },
  launching:{ dot: 'bg-brand animate-pulse', label: 'iniciando' },
};
const DOCKER_STATUS: Record<string, { dot: string; label: string }> = {
  running:  { dot: 'bg-ok animate-pulse',    label: 'rodando' },
  exited:   { dot: 'bg-muted/40',            label: 'encerrado' },
  paused:   { dot: 'bg-warn',                label: 'pausado' },
  created:  { dot: 'bg-muted/40',            label: 'criado' },
};
function statusCfg(item: ServiceItem) {
  if (item.kind === 'pm2') return PM2_STATUS[item.status] ?? PM2_STATUS.stopped;
  return DOCKER_STATUS[item.status] ?? DOCKER_STATUS.exited;
}

// ─── LogsModal ────────────────────────────────────────────────────────────────
function LogsModal({ item, onClose }: { item: ServiceItem; onClose: () => void }) {
  const isPm2 = item.kind === 'pm2';
  const pm2Logs = useQuery({
    queryKey: ['overview-logs-pm2', item.name],
    queryFn: () => api.get<{ out: string; err: string }>(`/pm2/${item.name}/logs?lines=300`),
    enabled: isPm2,
    refetchInterval: 5000,
  });
  const dockerLogs = useQuery({
    queryKey: ['overview-logs-docker', item.name],
    queryFn: () => api.get<{ logs: string }>(`/servers/local/containers/${item.name}/logs?tail=300`),
    enabled: !isPm2,
    refetchInterval: 5000,
  });
  const isLoading = isPm2 ? pm2Logs.isLoading : dockerLogs.isLoading;
  const content = isPm2 ? (pm2Logs.data?.out ?? '') : (dockerLogs.data?.logs ?? '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex h-[80vh] w-full max-w-3xl flex-col rounded-2xl border border-line bg-[#0d1117] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${statusCfg(item).dot}`} />
            <span className="font-mono text-sm font-semibold text-zinc-200">{item.name}</span>
            <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-400">
              {item.kind === 'pm2' ? 'PM2' : 'Docker'}
            </span>
          </div>
          <button onClick={onClose} className="rounded p-1.5 text-zinc-500 hover:bg-white/10 hover:text-zinc-200">
            <Icon name="trash" className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            </div>
          ) : (
            <pre className="whitespace-pre-wrap break-all font-mono text-[12px] leading-relaxed text-zinc-300">
              {content || '(sem logs)'}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ImportModal ──────────────────────────────────────────────────────────────
function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: (r: ImportResult) => void }) {
  const mut = useMutation({
    mutationFn: () => api.post<ImportResult>('/tools/import-all'),
    onSuccess: onDone,
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10">
            <Icon name="server" className="h-5 w-5 text-brand" />
          </div>
          <div>
            <h3 className="font-semibold text-ink">Importar todos os serviços</h3>
            <p className="text-xs text-muted">Registra PM2 e Docker no LiteDock sem perder nada</p>
          </div>
        </div>
        <div className="mb-5 space-y-2 rounded-xl border border-line bg-panel2 p-4 text-sm text-muted">
          <ul className="ml-4 list-disc space-y-1 text-xs">
            <li>Todos os processos PM2 (ativos e parados)</li>
            <li>Todos os containers Docker (exceto infra interna do LiteDock)</li>
            <li>Serviços já cadastrados são ignorados automaticamente</li>
          </ul>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:bg-panel2">Cancelar</button>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
          >
            {mut.isPending
              ? <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />Importando…</>
              : <><Icon name="server" className="h-4 w-4" />Importar agora</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ServiceRow ───────────────────────────────────────────────────────────────
function ServiceRow({
  item,
  onLogs,
}: {
  item: ServiceItem;
  onLogs: (i: ServiceItem) => void;
}) {
  const qc = useQueryClient();
  const st = statusCfg(item);
  const isPm2 = item.kind === 'pm2';
  const pm2 = isPm2 ? item as Pm2Item : null;
  const docker = !isPm2 ? item as DockerItem : null;

  const isRunning = isPm2 ? item.status === 'online' : item.status === 'running';

  const pm2Action = useMutation({
    mutationFn: (act: 'restart' | 'stop' | 'start') =>
      api.post(`/pm2/${item.name}/${act}`),
    onSuccess: () => { toast.success('OK'); qc.invalidateQueries({ queryKey: ['overview'] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  const dockerAction = useMutation({
    mutationFn: (act: 'restart' | 'start' | 'stop') =>
      api.post(`/servers/local/containers/${item.name}/${act}`),
    onSuccess: () => { toast.success('OK'); qc.invalidateQueries({ queryKey: ['overview'] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  const busy = pm2Action.isPending || dockerAction.isPending;

  function action(act: 'restart' | 'stop' | 'start') {
    if (isPm2) pm2Action.mutate(act);
    else dockerAction.mutate(act);
  }

  return (
    <tr className="group border-b border-line/50 hover:bg-panel2/40 transition-colors">
      {/* Status + nome */}
      <td className="py-3 pl-4 pr-2">
        <div className="flex items-center gap-2.5">
          <span className={`h-2 w-2 shrink-0 rounded-full ${st.dot}`} />
          <span className="max-w-[160px] truncate text-sm font-medium text-ink">{item.name}</span>
        </div>
      </td>

      {/* Tipo */}
      <td className="px-2 py-3">
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
          isPm2 ? 'border-brand/30 bg-brand/10 text-brand' : 'border-ok/30 bg-ok/10 text-ok'
        }`}>
          {isPm2 ? 'PM2' : 'Docker'}
        </span>
      </td>

      {/* Status */}
      <td className="px-2 py-3 text-xs text-muted">{st.label}</td>

      {/* Portas */}
      <td className="px-2 py-3">
        <div className="flex flex-wrap gap-1">
          {item.ports.length > 0
            ? item.ports.slice(0, 4).map((p) => (
                <span key={p} className="rounded border border-line bg-panel2 px-1.5 py-0.5 font-mono text-[11px] text-ink">
                  :{p}
                </span>
              ))
            : <span className="text-[11px] text-muted">—</span>}
        </div>
      </td>

      {/* Métricas */}
      <td className="px-2 py-3 text-right">
        {pm2 ? (
          <div className="flex flex-col items-end gap-0.5">
            <span className={`text-xs font-medium tabular-nums ${pm2.cpu > 80 ? 'text-bad' : pm2.cpu > 50 ? 'text-warn' : 'text-muted'}`}>
              {pm2.cpu.toFixed(1)}% CPU
            </span>
            <span className="text-[11px] text-muted tabular-nums">{fmtMem(pm2.memory)}</span>
          </div>
        ) : (
          <span className="max-w-[120px] truncate text-[11px] text-muted">
            {docker?.image.split('/').pop()?.split(':')[0] ?? '—'}
          </span>
        )}
      </td>

      {/* Uptime */}
      <td className="px-2 py-3 text-right text-xs text-muted tabular-nums">
        {pm2 ? (
          <div className="flex flex-col items-end gap-0.5">
            <span>{fmtUptime(pm2.uptime)}</span>
            {pm2.restarts > 0 && (
              <span className={`text-[10px] ${pm2.restarts > 10 ? 'text-warn' : 'text-muted/60'}`}>↺{pm2.restarts}</span>
            )}
          </div>
        ) : (
          docker?.status
        )}
      </td>

      {/* Ações */}
      <td className="py-3 pr-4 pl-2">
        <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={() => onLogs(item)}
            className="rounded p-1.5 text-muted hover:bg-panel2 hover:text-ink transition-colors"
            title="Logs"
          >
            <Icon name="book" className="h-3.5 w-3.5" />
          </button>
          {isRunning && (
            <button
              onClick={() => action('restart')}
              disabled={busy}
              className="rounded p-1.5 text-muted hover:bg-brand/10 hover:text-brand transition-colors disabled:opacity-40"
              title="Reiniciar"
            >
              <Icon name="refresh" className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => action(isRunning ? 'stop' : 'start')}
            disabled={busy}
            className={`rounded p-1.5 transition-colors disabled:opacity-40 ${
              isRunning
                ? 'text-muted hover:bg-warn/10 hover:text-warn'
                : 'text-muted hover:bg-ok/10 hover:text-ok'
            }`}
            title={isRunning ? 'Parar' : 'Iniciar'}
          >
            <Icon name={isRunning ? 'pause' : 'play'} className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export function Overview() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'pm2' | 'docker' | 'running'>('all');
  const [showImport, setShowImport] = useState(false);
  const [logsItem, setLogsItem] = useState<ServiceItem | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['overview'],
    queryFn: () => api.get<{ pm2: Pm2Item[]; docker: DockerItem[] }>('/tools/overview'),
    refetchInterval: 10_000,
  });

  const all: ServiceItem[] = [...(data?.pm2 ?? []), ...(data?.docker ?? [])];

  const filtered = all.filter((s) => {
    if (filter === 'pm2' && s.kind !== 'pm2') return false;
    if (filter === 'docker' && s.kind !== 'docker') return false;
    if (filter === 'running') {
      const ok = s.kind === 'pm2' ? s.status === 'online' : s.status === 'running';
      if (!ok) return false;
    }
    if (q) {
      const qq = q.toLowerCase();
      if (
        !s.name.toLowerCase().includes(qq) &&
        !(s.kind === 'pm2' ? s.cwd : (s as DockerItem).image).toLowerCase().includes(qq) &&
        !s.ports.some((p) => String(p).includes(qq))
      )
        return false;
    }
    return true;
  });

  const totalRunning = all.filter((s) =>
    s.kind === 'pm2' ? s.status === 'online' : s.status === 'running',
  ).length;

  function handleImportDone(r: ImportResult) {
    setImportResult(r);
    setShowImport(false);
    qc.invalidateQueries({ queryKey: ['projects'] });
    qc.invalidateQueries({ queryKey: ['overview'] });
    toast.success(`${r.imported} serviço(s) importado(s)!`);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <MetricsBar />

      {showImport && <ImportModal onClose={() => setShowImport(false)} onDone={handleImportDone} />}
      {logsItem && <LogsModal item={logsItem} onClose={() => setLogsItem(null)} />}

      {importResult && (
        <div className="flex items-start gap-3 rounded-xl border border-ok/30 bg-ok/10 p-4">
          <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
          <div className="text-sm">
            <span className="font-semibold text-ok">{importResult.imported} importado(s)</span>
            <span className="text-muted">, {importResult.skipped} ignorado(s)</span>
            {importResult.errors.length > 0 && (
              <div className="mt-1 text-xs text-warn">Erros: {importResult.errors.join(', ')}</div>
            )}
          </div>
          <button onClick={() => setImportResult(null)} className="ml-auto text-muted hover:text-ink">
            <Icon name="trash" className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-ink">Visão Geral</h2>
          <p className="mt-0.5 text-sm text-muted">
            {all.length} serviços · {totalRunning} ativos · hover para ações
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="rounded-lg border border-line p-2 text-muted hover:bg-panel2">
            <Icon name="refresh" className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 rounded-xl border border-brand/30 bg-brand/10 px-4 py-2 text-sm font-medium text-brand hover:bg-brand/20 transition-colors"
          >
            <Icon name="server" className="h-4 w-4" />
            Importar para LiteDock
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total',   value: String(all.length),                 sub: 'serviços' },
          { label: 'Ativos',  value: String(totalRunning),               sub: `de ${all.length}`, color: totalRunning > 0 ? 'text-ok' : 'text-muted' },
          { label: 'PM2',     value: String(data?.pm2.length ?? 0),      sub: 'processos', color: 'text-brand' },
          { label: 'Docker',  value: String(data?.docker.length ?? 0),   sub: 'containers', color: 'text-ok' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-line bg-panel p-4">
            <div className="text-xs text-muted">{s.label}</div>
            <div className={`mt-1 text-2xl font-bold tabular-nums ${s.color ?? 'text-ink'}`}>{s.value}</div>
            <div className="text-[11px] text-muted">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border border-line bg-panel p-1">
          {(['all', 'running', 'pm2', 'docker'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                filter === f ? 'bg-brand/10 text-ink ring-1 ring-inset ring-brand/25' : 'text-muted hover:text-ink'
              }`}
            >
              {f === 'all' ? 'Todos' : f === 'running' ? 'Ativos' : f.toUpperCase()}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nome, imagem, porta…"
          className="min-w-[200px] flex-1 rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand/50 focus:outline-none"
        />
        <span className="text-sm text-muted">{filtered.length} resultado(s)</span>
      </div>

      {/* Tabela */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Icon name="server" className="mb-4 h-12 w-12 text-muted/20" />
          <p className="text-base font-semibold text-ink">Nenhum serviço encontrado</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full">
            <thead className="border-b border-line bg-panel2">
              <tr>
                {['Nome', 'Tipo', 'Status', 'Portas', 'CPU / Imagem', 'Uptime', ''].map((h) => (
                  <th
                    key={h}
                    className="px-2 py-2.5 text-left text-xs font-semibold text-muted first:pl-4 last:pr-4 last:text-right"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <ServiceRow
                  key={`${item.kind}-${item.name}`}
                  item={item}
                  onLogs={setLogsItem}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
