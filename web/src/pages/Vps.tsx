import { useQuery } from '@tanstack/react-query';
import { api, type EngineInfo, type HostContainer } from '../lib/api';
import { Card, Stat } from '../components/Card';
import { Gauge } from '../components/Gauge';
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
  const stopped = e?.containersStopped ?? 0;
  const list = (containers.data ?? []).slice().sort((a, b) => Number(b.managed) - Number(a.managed));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">VPS</h1>
        <p className="stamp mt-1">Servidor e contêineres</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="vCPU" value={e?.ncpu ?? '—'} />
        <Stat label="Memória" value={gb(e?.memTotal)} />
        <Stat label="Contêineres" value={`${running}/${total}`} hint="no ar / total" />
        <Stat label="Imagens" value={e?.images ?? '—'} />
      </div>

      <Card title="Telemetria do host">
        <div className="grid gap-5 sm:grid-cols-2">
          <Gauge label="contêineres no ar" value={total ? (running / total) * 100 : 0} />
          <Gauge label="contêineres parados" value={total ? (stopped / total) * 100 : 0} tone="warn" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="plate-2 p-3">
            <div className="stamp mb-1">engine</div>
            <div className="text-sm text-ink">{e?.serverVersion ?? '—'}</div>
          </div>
          <div className="plate-2 p-3">
            <div className="stamp mb-1">host</div>
            <div className="truncate text-sm text-ink">{e?.name ?? '—'}</div>
          </div>
          <div className="plate-2 p-3">
            <div className="stamp mb-1">parados</div>
            <div className="text-sm text-ink">{stopped}</div>
          </div>
        </div>
      </Card>

      <Card
        title="Todos os contêineres"
        right={<span className="text-xs text-muted">{list.length}</span>}
      >
        {containers.isLoading ? (
          <Spinner />
        ) : list.length === 0 ? (
          <Empty title="Nenhum contêiner" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="stamp py-2 pr-3 font-normal">estado</th>
                  <th className="stamp py-2 pr-3 font-normal">nome</th>
                  <th className="stamp py-2 pr-3 font-normal">imagem</th>
                  <th className="stamp py-2 font-normal">status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id} className="border-b border-line/60">
                    <td className="py-2.5 pr-3">
                      <StatusDot state={c.state} withLabel />
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="text-sm text-ink">{c.name}</span>
                      {c.managed && (
                        <span className="ml-2 rounded border border-brand-dim/50 px-1.5 py-0.5 font-display text-[9px] font-medium text-brand-bright">
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
