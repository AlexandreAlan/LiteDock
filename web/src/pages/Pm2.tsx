import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { toast } from '../lib/toast';
import { Icon } from '../components/icons';

interface Pm2Proc {
  id: number; name: string; pid: number | null; status: string;
  cpu: number; memory: number; uptime: number | null; restarts: number;
  cwd: string; script: string; outLog: string; errLog: string;
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function fmtMem(b: number) {
  if (b === 0) return '0B';
  return b < 1_048_576 ? `${(b / 1024).toFixed(0)}KB` : `${(b / 1_048_576).toFixed(1)}MB`;
}

function fmtUptime(ts: number | null): string {
  if (!ts) return '—';
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return `${s.toFixed(0)}s`;
  if (s < 3600) return `${(s / 60).toFixed(0)}m`;
  if (s < 86400) return `${(s / 3600).toFixed(1)}h`;
  return `${(s / 86400).toFixed(1)}d`;
}

const STATUS_CFG: Record<string, { dot: string; badge: string; label: string }> = {
  online:   { dot: 'bg-ok animate-pulse',   badge: 'border-ok/30 bg-ok/10 text-ok',     label: 'online' },
  stopped:  { dot: 'bg-muted/50',           badge: 'border-line bg-panel2 text-muted',  label: 'parado' },
  errored:  { dot: 'bg-bad',                badge: 'border-bad/30 bg-bad/10 text-bad',  label: 'erro' },
  stopping: { dot: 'bg-warn',               badge: 'border-warn/30 bg-warn/10 text-warn', label: 'parando' },
  launching:{ dot: 'bg-brand animate-pulse',badge: 'border-brand/30 bg-brand/10 text-brand', label: 'iniciando' },
};

function cfg(status: string) {
  return STATUS_CFG[status] ?? STATUS_CFG.stopped;
}

// ─── Logs Modal ───────────────────────────────────────────────────────────────
function LogsModal({ proc, onClose }: { proc: Pm2Proc; onClose: () => void }) {
  const [tab, setTab] = useState<'out' | 'err'>('out');
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['pm2-logs', proc.name],
    queryFn: () => api.get<{ out: string; err: string }>(`/pm2/${proc.name}/logs?lines=250`),
    refetchInterval: 4000,
  });

  const content = (tab === 'out' ? data?.out : data?.err) || '';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 backdrop-blur-sm p-4 sm:items-center">
      <div className="flex w-full max-w-3xl flex-col rounded-2xl border border-line bg-panel shadow-2xl overflow-hidden" style={{ maxHeight: '82vh' }}>
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-line px-5 py-3 shrink-0">
          <span className={`h-2 w-2 rounded-full ${cfg(proc.status).dot}`} />
          <span className="text-sm font-semibold text-ink">{proc.name}</span>
          <div className="ml-4 flex gap-1">
            {(['out', 'err'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${tab === t ? 'bg-brand/20 text-brand' : 'text-muted hover:bg-panel2'}`}>
                {t === 'out' ? 'stdout' : 'stderr'}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <span className="text-[10px] text-muted">atualiza a cada 4s</span>
            <button onClick={() => refetch()} title="Atualizar agora"
              className="rounded p-1 text-muted hover:bg-panel2">
              <Icon name="refresh" className="h-3.5 w-3.5" />
            </button>
            <button onClick={onClose} className="rounded p-1 text-muted hover:bg-panel2">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto bg-[#0d1117] p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            </div>
          ) : content ? (
            <pre className="font-mono text-[11px] leading-[1.6] text-zinc-300 whitespace-pre-wrap break-all">
              {content}
            </pre>
          ) : (
            <div className="flex items-center justify-center py-12 text-zinc-500 text-sm">
              (sem logs disponíveis)
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-white/10 bg-[#161b22] px-5 py-2 shrink-0">
          <span className="truncate font-mono text-[10px] text-zinc-500">
            {tab === 'out' ? proc.outLog : proc.errLog}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Novo Processo Modal ──────────────────────────────────────────────────────
function NewProcessModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (d: { name: string; cmd: string; cwd: string }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [cmd, setCmd] = useState('');
  const [cwd, setCwd] = useState('/var/www/');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const canSubmit = name.trim() && cmd.trim() && cwd.trim();

  const submit = async () => {
    if (!canSubmit) return;
    setLoading(true); setErr('');
    try { await onCreate({ name: name.trim(), cmd: cmd.trim(), cwd: cwd.trim() }); onClose(); }
    catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-[500px] rounded-2xl border border-line bg-panel shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line px-6 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-ok/20">
            <Icon name="play" className="h-4 w-4 text-ok" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ink">Novo Processo PM2</h2>
            <p className="text-[11px] text-muted mt-0.5">Inicia e registra um processo permanente</p>
          </div>
          <button onClick={onClose} className="ml-auto rounded-lg p-1.5 text-muted hover:bg-panel2">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="space-y-4 p-6">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink">Nome do processo</label>
            <input autoFocus value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              placeholder="meu-app"
              className="w-full rounded-xl border border-line bg-panel2 px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/20" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink">Comando</label>
            <input value={cmd}
              onChange={(e) => setCmd(e.target.value)}
              placeholder="npm run start   |   tsx src/server.ts   |   python main.py"
              className="w-full rounded-xl border border-line bg-panel2 px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/20" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink">Diretório de trabalho (cwd)</label>
            <input value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              placeholder="/var/www/meu-app"
              className="w-full rounded-xl border border-line bg-panel2 px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/20" />
          </div>

          {cmd && cwd && (
            <div className="rounded-xl border border-white/8 bg-[#0d1117] px-4 py-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Vai executar</p>
              <div className="flex items-center gap-2">
                <span className="text-zinc-600">$</span>
                <code className="text-green-400 text-[12px] font-mono">{cmd}</code>
              </div>
              <div className="mt-1 text-[11px] text-zinc-500">
                em <code className="text-brand font-mono">{cwd}</code>
              </div>
            </div>
          )}

          {err && <p className="rounded-xl border border-bad/20 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <button onClick={onClose} className="rounded-xl border border-line px-4 py-2 text-sm text-ink hover:bg-panel2">
            Cancelar
          </button>
          <button onClick={submit} disabled={!canSubmit || loading}
            className="flex items-center gap-2 rounded-xl bg-ok px-5 py-2 text-sm font-semibold text-white hover:bg-ok/90 disabled:opacity-40 transition-colors">
            {loading
              ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              : <Icon name="play" className="h-4 w-4" />}
            Iniciar processo
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Card de processo ────────────────────────────────────────────────────────
function ProcessCard({
  proc, onAction,
}: {
  proc: Pm2Proc;
  onAction: (act: 'restart' | 'stop' | 'start' | 'delete') => void;
}) {
  const [showLogs, setShowLogs] = useState(false);
  const s = cfg(proc.status);
  const online = proc.status === 'online';

  return (
    <>
      {showLogs && <LogsModal proc={proc} onClose={() => setShowLogs(false)} />}

      <div className="rounded-xl border border-line bg-panel p-5 transition-colors hover:border-brand/20">
        <div className="flex items-start gap-4">

          {/* Indicador */}
          <div className="mt-1 shrink-0">
            <span className={`block h-3 w-3 rounded-full ${s.dot}`} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-ink">{proc.name}</span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${s.badge}`}>
                {s.label}
              </span>
              {proc.pid && (
                <span className="text-[10px] text-muted">PID {proc.pid}</span>
              )}
            </div>

            {/* Script + cwd */}
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
              <Icon name="terminal" className="h-3 w-3 shrink-0" />
              <span className="truncate" title={proc.script}>
                {proc.script.split('/').pop() || proc.script}
              </span>
              {proc.cwd && (
                <span className="truncate text-muted/50" title={proc.cwd}>
                  · {proc.cwd}
                </span>
              )}
            </div>

            {/* Métricas */}
            <div className="mt-3 flex flex-wrap gap-5">
              {[
                {
                  label: 'CPU',
                  value: `${proc.cpu.toFixed(1)}%`,
                  color: proc.cpu > 80 ? 'text-bad' : proc.cpu > 50 ? 'text-warn' : 'text-ink',
                },
                { label: 'RAM', value: fmtMem(proc.memory), color: 'text-ink' },
                { label: 'Uptime', value: fmtUptime(proc.uptime), color: 'text-ink' },
                {
                  label: 'Reinícios',
                  value: String(proc.restarts),
                  color: proc.restarts > 10 ? 'text-warn' : 'text-ink',
                },
              ].map((m) => (
                <div key={m.label} className="flex flex-col">
                  <span className="text-[10px] text-muted">{m.label}</span>
                  <span className={`text-sm font-semibold tabular-nums ${m.color}`}>{m.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Ações */}
          <div className="flex shrink-0 items-center gap-1.5">
            <button onClick={() => setShowLogs(true)}
              className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted hover:border-brand/30 hover:bg-brand/5 hover:text-ink transition-colors"
              title="Ver logs">
              <Icon name="book" className="h-3.5 w-3.5" /> Logs
            </button>

            {online && (
              <button onClick={() => onAction('restart')}
                className="rounded-lg border border-line p-2 text-muted hover:border-brand/30 hover:bg-brand/5 hover:text-brand transition-colors"
                title="Reiniciar">
                <Icon name="refresh" className="h-4 w-4" />
              </button>
            )}

            {online ? (
              <button onClick={() => onAction('stop')}
                className="rounded-lg border border-line p-2 text-muted hover:border-warn/40 hover:bg-warn/5 hover:text-warn transition-colors"
                title="Parar">
                <Icon name="pause" className="h-4 w-4" />
              </button>
            ) : (
              <button onClick={() => onAction('start')}
                className="rounded-lg border border-line p-2 text-muted hover:border-ok/40 hover:bg-ok/5 hover:text-ok transition-colors"
                title="Iniciar">
                <Icon name="play" className="h-4 w-4" />
              </button>
            )}

            <button
              onClick={() => {
                if (confirm(`Remover "${proc.name}" do PM2 permanentemente?`)) onAction('delete');
              }}
              className="rounded-lg border border-line p-2 text-muted hover:border-bad/40 hover:bg-bad/5 hover:text-bad transition-colors"
              title="Remover">
              <Icon name="trash" className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export function Pm2() {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['pm2-processes'],
    queryFn: () => api.get<{ processes: Pm2Proc[] }>('/pm2/processes'),
    refetchInterval: 5000,
  });

  const processes = data?.processes ?? [];
  const online = processes.filter((p) => p.status === 'online').length;
  const errored = processes.filter((p) => p.status === 'errored').length;
  const totalCpu = processes.reduce((s, p) => s + p.cpu, 0);
  const totalMem = processes.reduce((s, p) => s + p.memory, 0);

  const action = useMutation({
    mutationFn: ({ name, act }: { name: string; act: string }) =>
      act === 'delete'
        ? api.del(`/pm2/${encodeURIComponent(name)}`)
        : api.post(`/pm2/${encodeURIComponent(name)}/${act}`, {}),
    onSuccess: (_, { act, name }) => {
      qc.invalidateQueries({ queryKey: ['pm2-processes'] });
      const msg: Record<string, string> = {
        restart: `${name} reiniciado`,
        stop: `${name} parado`,
        start: `${name} iniciado`,
        delete: `${name} removido`,
      };
      toast.success(msg[act] ?? 'Ação concluída');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const create = useMutation({
    mutationFn: (d: { name: string; cmd: string; cwd: string }) =>
      api.post('/pm2/processes', d),
    onSuccess: (_, { name }) => {
      qc.invalidateQueries({ queryKey: ['pm2-processes'] });
      toast.success(`"${name}" iniciado no PM2`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {showNew && (
        <NewProcessModal
          onClose={() => setShowNew(false)}
          onCreate={(d) => create.mutateAsync(d) as Promise<void>}
        />
      )}

      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <h2 className="text-xl font-semibold text-ink">PM2 — Processos</h2>
          <p className="mt-0.5 text-sm text-muted">
            Processos Node.js, Python e outros rodando permanentemente no servidor
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {processes.length > 0 && (
            <div className="flex items-center gap-3 text-sm text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-ok" />
                {online} online
              </span>
              {errored > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-bad" />
                  {errored} com erro
                </span>
              )}
            </div>
          )}
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 transition-colors">
            <Icon name="plus" className="h-4 w-4" /> Novo Processo
          </button>
        </div>
      </div>

      {/* Estatísticas globais */}
      {processes.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Total',        value: String(processes.length), sub: 'processos' },
            { label: 'Online',       value: String(online),          sub: `de ${processes.length}`,    color: online > 0 ? 'text-ok' : 'text-muted' },
            { label: 'CPU total',    value: `${totalCpu.toFixed(1)}%`, sub: 'soma',               color: totalCpu > 80 ? 'text-bad' : totalCpu > 50 ? 'text-warn' : undefined },
            { label: 'RAM total',    value: fmtMem(totalMem),         sub: 'soma' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-line bg-panel p-4">
              <div className="text-xs text-muted">{s.label}</div>
              <div className={`mt-1 text-2xl font-bold tabular-nums ${s.color ?? 'text-ink'}`}>{s.value}</div>
              <div className="text-[11px] text-muted">{s.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Lista */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        </div>
      ) : processes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Icon name="server" className="h-12 w-12 text-muted/20 mb-4" />
          <p className="text-base font-semibold text-ink">Nenhum processo PM2 ativo</p>
          <p className="mt-1 text-sm text-muted">Inicie um processo para gerenciá-lo aqui</p>
          <button onClick={() => setShowNew(true)}
            className="mt-5 flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand/90">
            <Icon name="plus" className="h-4 w-4" /> Novo Processo
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {processes.map((p) => (
            <ProcessCard
              key={p.id}
              proc={p}
              onAction={(act) => action.mutate({ name: p.name, act })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
