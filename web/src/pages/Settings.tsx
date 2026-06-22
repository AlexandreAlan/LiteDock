import { useQuery } from '@tanstack/react-query';
import { api, type HostMetrics, type EngineInfo } from '../lib/api';
import { Card } from '../components/Card';
import { useAuth } from '../lib/auth';

function gb(b?: number) {
  return b ? `${(b / 1024 ** 3).toFixed(1)} GB` : '—';
}

export function Settings() {
  const { user } = useAuth();
  const { data: m } = useQuery({ queryKey: ['metrics'], queryFn: () => api.get<HostMetrics>('/servers/local/metrics') });
  const { data: e } = useQuery({ queryKey: ['engine'], queryFn: () => api.get<EngineInfo>('/servers/local/engine') });

  const row = (k: string, v: React.ReactNode) => (
    <div className="flex items-center justify-between border-b border-line py-2.5 text-sm last:border-0">
      <span className="text-muted">{k}</span>
      <span className="font-medium text-ink">{v}</span>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Ajustes</h1>
        <p className="label mt-1">Servidor e conta</p>
      </div>

      <Card title="Servidor">
        {row('Hostname', m?.hostname ?? '—')}
        {row('CPU', `${m?.cpu.cores ?? '—'} cores`)}
        {row('Memória', gb(m?.memory.totalBytes))}
        {row('Disco', gb(m?.disk.totalBytes))}
        {row('Docker Engine', e?.serverVersion ?? '—')}
        {row('Uptime', m ? `${Math.floor(m.uptimeSec / 86400)}d` : '—')}
      </Card>

      <Card title="Conta">
        {row('E-mail', user?.email)}
        {row('Papel', user?.role)}
      </Card>

      <Card title="Sobre">
        {row('LiteDock', 'v0.6.0')}
        {row('Modo de deploy', <span className="text-ok">Ativo</span>)}
      </Card>
    </div>
  );
}
