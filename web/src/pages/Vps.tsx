import { useQuery } from '@tanstack/react-query';
import { api, type EngineInfo, type HostContainer } from '../lib/api';
import { Card, Stat } from '../components/Card';
import { MetricsBar } from '../components/MetricsBar';
import { StatusDot } from '../components/StatusDot';
import { Spinner, Empty } from '../components/ui';

function gb(bytes?: number) {
  return bytes ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : '—';
}

export function Vps() {
  const engine = useQuery({ queryKey: ['engine'], queryFn: () => api.get<EngineInfo>('/servers/local/engine') });
  const containers = useQuery({
    queryKey: ['containers'],
    queryFn: () => api.get<HostContainer[]>('/servers/local/containers'),
    refetchInterval: 10_000,
  });

  const e = engine.data;
  const total = e?.containers ?? 0;
  const running = e?.containersRunning ?? 0;
  const list = (containers.data ?? []).slice().sort((a, b) => Number(b.managed) - Number(a.managed));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Monitor</h1>
        <p className="label mt-1">Servidor e contêineres em tempo real</p>
      </div>

      <MetricsBar />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="vCPU" value={e?.ncpu ?? '—'} />
        <Stat label="Memória" value={gb(e?.memTotal)} />
        <Stat label="Contêineres" value={`${running}/${total}`} hint="no ar / total" />
        <Stat label="Imagens" value={e?.images ?? '—'} />
      </div>

      <Card title="Contêineres" right={<span className="text-xs text-muted">{list.length}</span>}>
        {containers.isLoading ? (
          <Spinner />
        ) : list.length === 0 ? (
          <Empty title="Nenhum contêiner" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2 pr-3 font-medium">Estado</th>
                  <th className="py-2 pr-3 font-medium">Nome</th>
                  <th className="py-2 pr-3 font-medium">Imagem</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id} className="border-b border-line/60 last:border-0">
                    <td className="py-2.5 pr-3"><StatusDot state={c.state} withLabel /></td>
                    <td className="py-2.5 pr-3">
                      <span className="text-sm text-ink">{c.name}</span>
                      {c.managed && (
                        <span className="ml-2 rounded bg-brand/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-brand-ink">
                          litedock
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-[11px] text-muted">{c.image}</td>
                    <td className="py-2.5 text-[11px] text-muted">{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
