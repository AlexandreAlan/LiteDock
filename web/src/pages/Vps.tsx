import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type ContainerStat, type DockerEvent, type StorageItem } from '../lib/api';
import { Card } from '../components/Card';
import { MetricsBar } from '../components/MetricsBar';
import { Spinner, Empty } from '../components/ui';

function bytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}
function bps(b: number) {
  if (b < 1024) return `${b.toFixed(0)} B/s`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB/s`;
  return `${(b / 1024 ** 2).toFixed(1)} MB/s`;
}
function hhmmss(t: number) {
  return new Date(t).toLocaleTimeString('pt-BR', { hour12: false });
}

type Tab = 'services' | 'events' | 'storage';

export function Vps() {
  const [tab, setTab] = useState<Tab>('services');
  const TABS: { key: Tab; label: string }[] = [
    { key: 'services', label: 'Serviços' },
    { key: 'events', label: 'Eventos de Docker' },
    { key: 'storage', label: 'Armazenamento' },
  ];
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <MetricsBar />

      <div className="flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={[
              '-mb-px border-b-2 px-3.5 py-2 text-sm font-medium transition-colors',
              tab === t.key ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'services' && <ServicesTab />}
      {tab === 'events' && <EventsTab />}
      {tab === 'storage' && <StorageTab />}
    </div>
  );
}

// ── Serviços: CPU / memória / rede por container ─────────────────────────
function ServicesTab() {
  const q = useQuery({
    queryKey: ['container-stats'],
    queryFn: () => api.get<ContainerStat[]>('/servers/local/container-stats'),
    refetchInterval: 5000,
  });
  const list = q.data ?? [];
  return (
    <Card title="Serviços" right={<span className="text-xs text-muted">{list.length}</span>}>
      {q.isLoading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <Empty title="Nenhum container em execução" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">Serviço</th>
                <th className="py-2 pr-3 text-right font-medium">CPU</th>
                <th className="py-2 pr-3 text-right font-medium">Memória</th>
                <th className="py-2 pr-3 text-right font-medium">Rede ↓</th>
                <th className="py-2 text-right font-medium">Rede ↑</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="border-b border-line/60 last:border-0">
                  <td className="py-2.5 pr-3">
                    <span className="text-ink">{c.name}</span>
                    {c.managed && (
                      <span className="ml-2 rounded bg-brand/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-brand-ink">litedock</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-muted">{c.cpuPct.toFixed(1)} %</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-muted">{bytes(c.memBytes)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-muted">{bps(c.netInBps)}</td>
                  <td className="py-2.5 text-right tabular-nums text-muted">{bps(c.netOutBps)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ── Eventos de Docker (stream) ───────────────────────────────────────────
function EventsTab() {
  const q = useQuery({
    queryKey: ['docker-events'],
    queryFn: () => api.get<DockerEvent[]>('/servers/local/docker-events?limit=80'),
    refetchInterval: 3000,
  });
  const list = q.data ?? [];
  return (
    <Card title="Eventos de Docker" subtitle="Stream de eventos do daemon (criação, exec, healthcheck…).">
      {q.isLoading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <Empty title="Sem eventos recentes" hint="Os eventos aparecem aqui conforme o Docker os emite." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">Tipo</th>
                <th className="py-2 pr-3 font-medium">Ação</th>
                <th className="py-2 pr-3 font-medium">Hora</th>
                <th className="py-2 font-medium">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {list.map((e, i) => (
                <tr key={i} className="border-b border-line/60 last:border-0">
                  <td className="py-2 pr-3 text-muted">{e.type}</td>
                  <td className="py-2 pr-3 font-mono text-[12px] text-ink">{e.action}</td>
                  <td className="py-2 pr-3 tabular-nums text-muted">{hhmmss(e.time)}</td>
                  <td className="py-2 truncate text-[12px] text-muted">{e.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ── Armazenamento (docker system df) ─────────────────────────────────────
function StorageTab() {
  const q = useQuery({
    queryKey: ['storage'],
    queryFn: () => api.get<StorageItem[]>('/servers/local/storage'),
    refetchInterval: 15000,
  });
  const list = q.data ?? [];
  return (
    <Card title="Armazenamento" right={<span className="text-xs text-muted">{list.length}</span>} subtitle="Uso de disco por container e volume.">
      {q.isLoading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <Empty title="Nada para mostrar" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">Nome</th>
                <th className="py-2 pr-3 font-medium">Tipo</th>
                <th className="py-2 pr-3 text-right font-medium">Tamanho</th>
                <th className="py-2 font-medium">Caminho</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s, i) => (
                <tr key={i} className="border-b border-line/60 last:border-0">
                  <td className="py-2.5 pr-3 text-ink">{s.name}</td>
                  <td className="py-2.5 pr-3 text-muted">{s.kind === 'volume' ? 'volume' : 'container'}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-muted">{bytes(s.sizeBytes)}</td>
                  <td className="py-2.5 truncate font-mono text-[11px] text-muted">{s.path}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
