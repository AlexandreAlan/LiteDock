import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, type EngineInfo, type HostContainer, type Project } from '../lib/api';
import { Card, Stat } from '../components/Card';
import { Gauge } from '../components/Gauge';
import { StatusDot } from '../components/StatusDot';
import { Spinner, Empty } from '../components/ui';

function gb(bytes?: number) {
  if (!bytes) return '—';
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export function Painel() {
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api.get<Project[]>('/projects') });
  const engine = useQuery({ queryKey: ['engine'], queryFn: () => api.get<EngineInfo>('/servers/local/engine') });
  const containers = useQuery({
    queryKey: ['containers'],
    queryFn: () => api.get<HostContainer[]>('/servers/local/containers'),
    refetchInterval: 15_000,
  });

  const e = engine.data;
  const total = e?.containers ?? 0;
  const running = e?.containersRunning ?? 0;
  const appCount = (projects.data ?? []).reduce((n, p) => n + (p.services?.length ?? 0), 0);
  const units = (containers.data ?? []).slice().sort((a, b) => Number(b.managed) - Number(a.managed));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Painel</h1>
        <p className="stamp mt-1">visão geral da casa de máquinas</p>
      </div>

      {/* Placar */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="apps" value={appCount} hint={`${projects.data?.length ?? 0} projeto(s)`} />
        <Stat label="contêineres" value={`${running}/${total}`} hint="no ar / total" />
        <Stat label="imagens" value={e?.images ?? '—'} hint="baixadas" />
        <Stat label="memória" value={gb(e?.memTotal)} hint={`${e?.ncpu ?? '—'} vCPU`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        {/* Telemetria — gauges (assinatura) */}
        <Card title="Telemetria">
          <div className="space-y-5">
            <Gauge label="ocupação de contêineres" value={total ? (running / total) * 100 : 0} />
            <Gauge
              label="parados"
              value={total ? ((e?.containersStopped ?? 0) / total) * 100 : 0}
              tone="warn"
            />
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="plate-2 p-3">
                <div className="stamp mb-1">engine</div>
                <div className="font-mono text-sm text-ink">{e?.serverVersion ?? '—'}</div>
              </div>
              <div className="plate-2 p-3">
                <div className="stamp mb-1">host</div>
                <div className="truncate font-mono text-sm text-ink">{e?.name ?? '—'}</div>
              </div>
            </div>
          </div>
        </Card>

        {/* Unidades em operação */}
        <Card
          title="Unidades em operação"
          right={<span className="font-mono text-xs text-muted">{units.length}</span>}
        >
          {containers.isLoading ? (
            <Spinner />
          ) : units.length === 0 ? (
            <Empty title="Nenhuma unidade" hint="Quando você subir um app, ele aparece aqui." />
          ) : (
            <ul className="divide-y divide-line">
              {units.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2.5">
                  <StatusDot state={c.state} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-mono text-sm text-ink">{c.name}</span>
                      {c.managed && (
                        <span className="rounded border border-copper-dim/50 px-1.5 py-0.5 font-display text-[9px] uppercase tracking-stamp text-copper-bright">
                          litedock
                        </span>
                      )}
                    </div>
                    <div className="truncate font-mono text-[11px] text-muted">{c.image}</div>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-muted">{c.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <p className="text-center font-mono text-[11px] text-muted">
        <Link to="/vps" className="text-copper hover:text-copper-bright">
          ver VPS completa →
        </Link>
      </p>
    </div>
  );
}
