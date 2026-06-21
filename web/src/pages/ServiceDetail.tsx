import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api, type Service } from '../lib/api';
import { Card } from '../components/Card';
import { Gauge } from '../components/Gauge';
import { StatusDot } from '../components/StatusDot';
import { Spinner, ErrorNote, Empty } from '../components/ui';

interface ServiceFull extends Service {
  env?: { id?: string; key: string; value?: string }[];
  domains?: { id: string; host: string }[];
}
interface Stats {
  cpuPct?: number;
  memPct?: number;
  memBytes?: number;
}

export function ServiceDetail() {
  const { id = '' } = useParams();
  const svc = useQuery({
    queryKey: ['service', id],
    queryFn: () => api.get<ServiceFull>(`/services/${id}`),
  });
  const stats = useQuery({
    queryKey: ['service-stats', id],
    queryFn: () => api.get<Stats>(`/services/${id}/stats`),
    refetchInterval: 8_000,
    retry: false,
  });
  const logs = useQuery({
    queryKey: ['service-logs', id],
    queryFn: () => api.get<{ logs?: string } | string>(`/services/${id}/logs`),
    retry: false,
  });

  if (svc.isLoading) return <Spinner label="lendo a unidade…" />;
  if (svc.error) return <ErrorNote message={(svc.error as Error).message} />;
  const s = svc.data!;
  const logText = typeof logs.data === 'string' ? logs.data : logs.data?.logs;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Link to="/apps" className="hover:text-brand-bright">
          apps
        </Link>
        <span>/</span>
        <span className="text-ink">{s.name}</span>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <StatusDot state={s.status} />
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink">{s.name}</h1>
            <p className="text-xs text-muted">{s.image || s.type}</p>
          </div>
        </div>
        {/* Ações guardadas pelo modo seguro */}
        <div className="flex gap-2">
          {['reiniciar', 'parar', 'deploy'].map((a) => (
            <button
              key={a}
              className="btn-ghost cursor-not-allowed opacity-50"
              title="Modo seguro — ações de deploy desativadas"
              disabled
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card title="Console">
          {logs.isLoading ? (
            <Spinner />
          ) : logText ? (
            <pre className="max-h-80 overflow-auto rounded-lg bg-ink p-3 font-mono text-[11px] leading-relaxed text-panel2">
              {logText}
            </pre>
          ) : (
            <Empty title="Sem logs" hint="Esta unidade ainda não produziu saída." />
          )}
        </Card>

        <div className="space-y-6">
          <Card title="Telemetria">
            {stats.data ? (
              <div className="space-y-4">
                <Gauge label="cpu" value={stats.data.cpuPct ?? 0} />
                <Gauge label="memória" value={stats.data.memPct ?? 0} tone="brand" />
              </div>
            ) : (
              <p className="text-xs text-muted">Métricas indisponíveis no modo atual.</p>
            )}
          </Card>

          <Card title="Variáveis de ambiente" right={<span className="text-xs text-muted">{s.env?.length ?? 0}</span>}>
            {s.env && s.env.length > 0 ? (
              <ul className="space-y-1.5">
                {s.env.map((v) => (
                  <li key={v.key} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-brand-bright">{v.key}</span>
                    <span className="truncate text-muted">••••••</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted">Nenhuma variável definida.</p>
            )}
          </Card>

          {s.domains && s.domains.length > 0 && (
            <Card title="Domínios">
              <ul className="space-y-1.5">
                {s.domains.map((d) => (
                  <li key={d.id} className="text-xs text-ink">
                    {d.host}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
