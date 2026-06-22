import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type HostMetrics } from '../lib/api';

function gb(b: number) {
  return `${(b / 1024 ** 3).toFixed(1)} GB`;
}
function bps(b: number) {
  if (b < 1024) return `${b.toFixed(1)} B/s`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB/s`;
  return `${(b / 1024 ** 2).toFixed(1)} MB/s`;
}

const N = 40; // amostras no histórico do sparkline

// Mini-gráfico de linha + área (estilo EasyPanel). Estica na largura do card.
function Spark({ data, color, max }: { data: number[]; color: string; max?: number }) {
  const d = data.length === 1 ? [data[0], data[0]] : data;
  if (d.length < 2) return <div className="h-8" />;
  const hi = Math.max(1, max ?? Math.max(...d));
  const n = d.length;
  const line = d.map((v, i) => `${(i / (n - 1)) * 100},${32 - (Math.min(v, hi) / hi) * 28 - 2}`).join(' ');
  const area = `0,32 ${line} 100,32`;
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-8 w-full">
      <polygon points={area} fill={color} opacity="0.12" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function MetricCard({ label, value, sub, data, color, max }: {
  label: string; value: string; sub: string; data: number[]; color: string; max?: number;
}) {
  return (
    <div className="card flex flex-col p-4">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-0.5 text-2xl font-bold tabular-nums text-ink">{value}</div>
      <div className="truncate text-[11px] text-muted">{sub}</div>
      <div className="mt-2"><Spark data={data} color={color} max={max} /></div>
    </div>
  );
}

export function MetricsBar() {
  const { data: m, dataUpdatedAt } = useQuery({
    queryKey: ['metrics'],
    queryFn: () => api.get<HostMetrics>('/servers/local/metrics'),
    refetchInterval: 3000,
  });

  const [h, setH] = useState({ cpu: [] as number[], mem: [] as number[], disk: [] as number[], in: [] as number[], out: [] as number[] });
  useEffect(() => {
    if (!m) return;
    const push = (a: number[], v: number) => [...a, v].slice(-N);
    setH((p) => ({
      cpu: push(p.cpu, m.cpu.pct),
      mem: push(p.mem, m.memory.pct),
      disk: push(p.disk, m.disk.pct),
      in: push(p.in, m.network.inBps),
      out: push(p.out, m.network.outBps),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUpdatedAt]);

  if (!m) {
    return (
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card h-[118px] animate-pulse p-4" />
        ))}
      </div>
    );
  }

  const netMax = Math.max(1, ...h.in, ...h.out);
  return (
    <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
      <MetricCard label="CPU" value={`${m.cpu.pct.toFixed(1)}%`} sub={`${m.cpu.cores} cores · load ${m.cpu.load.map((l) => l.toFixed(2)).join(', ')}`} data={h.cpu} color="#F97316" max={100} />
      <MetricCard label="Memória" value={`${m.memory.pct.toFixed(1)}%`} sub={`${gb(m.memory.usedBytes)} / ${gb(m.memory.totalBytes)}`} data={h.mem} color="#3B82F6" max={100} />
      <MetricCard label="Disco" value={`${m.disk.pct.toFixed(1)}%`} sub={`${gb(m.disk.usedBytes)} / ${gb(m.disk.totalBytes)}`} data={h.disk} color="#10B981" max={100} />
      <MetricCard label="Entrada de rede" value={bps(m.network.inBps)} sub="tráfego de entrada" data={h.in} color="#0EA5E9" max={netMax} />
      <MetricCard label="Saída de rede" value={bps(m.network.outBps)} sub="tráfego de saída" data={h.out} color="#A855F7" max={netMax} />
    </div>
  );
}
