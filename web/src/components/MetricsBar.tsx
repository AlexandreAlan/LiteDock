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

const N = 48; // amostras no histórico
// Histórico em nível de módulo: persiste enquanto a aba estiver aberta, então
// os gráficos não "zeram" ao navegar entre páginas (igual ao EasyPanel).
const HIST: Record<'cpu' | 'mem' | 'disk' | 'in' | 'out', number[]> = {
  cpu: [], mem: [], disk: [], in: [], out: [],
};

// Sparkline: linha + área em gradiente, sangrando até a borda inferior do card.
function Spark({ data, color, max }: { data: number[]; color: string; max?: number }) {
  if (data.length < 2) return null;
  const hi = Math.max(1, max ?? Math.max(...data));
  const n = data.length;
  const W = 100, H = 52;
  const pt = (v: number, i: number) => [(i / (n - 1)) * W, H - (Math.min(v, hi) / hi) * (H - 6) - 2];
  const pts = data.map(pt);
  const line = pts.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
  const area = `0,${H} ${line} ${W},${H}`;
  const gid = 'sg-' + color.replace('#', '');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-[52px] w-full">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function MetricCard({ label, value, sub, data, color, max }: {
  label: string; value: string; sub: string; data: number[]; color: string; max?: number;
}) {
  return (
    <div className="card relative overflow-hidden p-4 pb-14">
      <div className="relative z-10">
        <div className="text-xs font-medium text-muted">{label}</div>
        <div className="mt-0.5 text-[26px] font-bold leading-tight tabular-nums text-ink">{value}</div>
        <div className="truncate text-[11px] text-muted">{sub}</div>
      </div>
      <Spark data={data} color={color} max={max} />
    </div>
  );
}

export function MetricsBar() {
  const { data: m, dataUpdatedAt } = useQuery({
    queryKey: ['metrics'],
    queryFn: () => api.get<HostMetrics>('/servers/local/metrics'),
    refetchInterval: 2000,
  });

  const [, force] = useState(0);
  useEffect(() => {
    if (!m) return;
    const push = (a: number[], v: number) => {
      if (a.length === 0) for (let i = 0; i < 12; i++) a.push(v); // semeia p/ não ficar vazio
      a.push(v);
      while (a.length > N) a.shift();
    };
    push(HIST.cpu, m.cpu.pct);
    push(HIST.mem, m.memory.pct);
    push(HIST.disk, m.disk.pct);
    push(HIST.in, m.network.inBps);
    push(HIST.out, m.network.outBps);
    force((x) => x + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUpdatedAt]);

  if (!m) {
    return (
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card h-[132px] animate-pulse p-4" />
        ))}
      </div>
    );
  }

  const netMax = Math.max(1, ...HIST.in, ...HIST.out);
  return (
    <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
      <MetricCard label="CPU" value={`${m.cpu.pct.toFixed(1)}%`} sub={`${m.cpu.cores} cores · load ${m.cpu.load.map((l) => l.toFixed(2)).join(', ')}`} data={HIST.cpu} color="#F97316" max={100} />
      <MetricCard label="Memória" value={`${m.memory.pct.toFixed(1)}%`} sub={`${gb(m.memory.usedBytes)} / ${gb(m.memory.totalBytes)}`} data={HIST.mem} color="#3B82F6" max={100} />
      <MetricCard label="Disco" value={`${m.disk.pct.toFixed(1)}%`} sub={`${gb(m.disk.usedBytes)} / ${gb(m.disk.totalBytes)}`} data={HIST.disk} color="#10B981" max={100} />
      <MetricCard label="Entrada de rede" value={bps(m.network.inBps)} sub="tráfego de entrada" data={HIST.in} color="#0EA5E9" max={netMax} />
      <MetricCard label="Saída de rede" value={bps(m.network.outBps)} sub="tráfego de saída" data={HIST.out} color="#A855F7" max={netMax} />
    </div>
  );
}
