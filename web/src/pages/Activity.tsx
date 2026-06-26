import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card } from '../components/Card';
import { Spinner, ErrorNote } from '../components/ui';
import { Icon } from '../components/icons';

interface ActivityDeployment {
  id: string;
  status: string;
  trigger: string;
  commitSha?: string | null;
  imageTag?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  service: { id: string; name: string; project: { id: string; name: string } };
}

interface ActivityStats {
  total: number;
  successes: number;
  failures: number;
  today: number;
}

const STATUS_STYLE: Record<string, string> = {
  success: 'bg-ok/10 text-ok border-ok/30',
  failed: 'bg-bad/10 text-bad border-bad/30',
  deploying: 'bg-brand/10 text-brand border-brand/30',
  building: 'bg-warn/10 text-warn border-warn/30',
  queued: 'bg-panel2 text-muted border-line',
};

const STATUS_LABEL: Record<string, string> = {
  success: 'Sucesso',
  failed: 'Falhou',
  deploying: 'Deployando',
  building: 'Compilando',
  queued: 'Na fila',
};

const TRIGGER_ICON: Record<string, 'zap' | 'refresh' | 'globe'> = {
  webhook: 'zap',
  api: 'refresh',
  manual: 'globe',
};

function duration(start: string, end?: string | null): string {
  const ms = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime();
  if (ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s atrás`;
  if (s < 3600) return `${Math.floor(s / 60)}m atrás`;
  if (s < 86400) return `${Math.floor(s / 3600)}h atrás`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

export function Activity() {
  const [filter, setFilter] = useState<string>('all');

  const { data: stats } = useQuery({
    queryKey: ['activity-stats'],
    queryFn: () => api.get<ActivityStats>('/activity/stats'),
    refetchInterval: 15_000,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['activity'],
    queryFn: () => api.get<{ deployments: ActivityDeployment[]; total: number }>('/activity?take=100'),
    refetchInterval: 10_000,
  });

  const deployments = data?.deployments ?? [];
  const filtered = filter === 'all' ? deployments : deployments.filter((d) => d.status === filter);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Atividade</h1>
        <p className="label mt-1">Histórico de deploys</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Total de deploys', value: stats?.total ?? '—', color: 'text-ink' },
          { label: 'Hoje', value: stats?.today ?? '—', color: 'text-brand' },
          { label: 'Com sucesso', value: stats?.successes ?? '—', color: 'text-ok' },
          { label: 'Com falha', value: stats?.failures ?? '—', color: 'text-bad' },
        ].map((s) => (
          <div key={s.label} className="plate-2 p-4">
            <div className="stamp mb-1">{s.label}</div>
            <div className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {['all', 'success', 'failed', 'deploying', 'building', 'queued'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={[
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              filter === f
                ? 'border-brand bg-brand/10 text-brand-ink'
                : 'border-line text-muted hover:bg-panel2',
            ].join(' ')}
          >
            {f === 'all' ? 'Todos' : STATUS_LABEL[f] ?? f}
          </button>
        ))}
      </div>

      <Card>
        {isLoading ? (
          <Spinner />
        ) : error ? (
          <ErrorNote message={(error as Error).message} />
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted">Nenhum deploy encontrado.</div>
        ) : (
          <div className="divide-y divide-line">
            {filtered.map((d) => {
              const statusStyle = STATUS_STYLE[d.status] ?? STATUS_STYLE.queued;
              const trigIcon = TRIGGER_ICON[d.trigger] ?? 'refresh';
              const isRunning = d.status === 'deploying' || d.status === 'building' || d.status === 'queued';
              return (
                <div key={d.id} className="flex flex-wrap items-center gap-4 px-4 py-3 hover:bg-panel2/40">
                  {/* Status badge */}
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusStyle}`}>
                    {isRunning && (
                      <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                    )}
                    {STATUS_LABEL[d.status] ?? d.status}
                  </span>

                  {/* Serviço */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link to={`/service/${d.service.id}`} className="font-medium text-ink hover:text-brand hover:underline">
                        {d.service.name}
                      </Link>
                      <span className="text-xs text-muted">/</span>
                      <Link to={`/project/${d.service.project.id}`} className="text-xs text-muted hover:text-ink">
                        {d.service.project.name}
                      </Link>
                    </div>
                    {d.commitSha && (
                      <div className="mt-0.5 font-mono text-[11px] text-muted">{d.commitSha.slice(0, 8)}</div>
                    )}
                  </div>

                  {/* Trigger + duração + tempo */}
                  <div className="flex items-center gap-3 text-xs text-muted">
                    <span className="flex items-center gap-1">
                      <Icon name={trigIcon} className="h-3.5 w-3.5" />
                      {d.trigger}
                    </span>
                    <span className="tabular-nums">{duration(d.startedAt, d.finishedAt)}</span>
                    <span className="tabular-nums">{timeAgo(d.startedAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
