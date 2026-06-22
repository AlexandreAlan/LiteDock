import { useQuery } from '@tanstack/react-query';
import { api, type HostMetrics } from '../lib/api';

function gb(b: number) {
  return `${(b / 1024 ** 3).toFixed(1)} GB`;
}
function bps(b: number) {
  if (b < 1024) return `${b} B/s`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB/s`;
  return `${(b / 1024 ** 2).toFixed(1)} MB/s`;
}
function toneOf(pct: number) {
  return pct >= 85 ? '#DC2626' : pct >= 65 ? '#D97706' : '#059669';
}

function Ring({ pct }: { pct: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const off = c - (Math.min(100, pct) / 100) * c;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" className="shrink-0">
      <circle cx="32" cy="32" r={r} fill="none" stroke="#F1F5F5" strokeWidth="6" />
      <circle
        cx="32" cy="32" r={r} fill="none" stroke={toneOf(pct)} strokeWidth="6"
        strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
        transform="rotate(-90 32 32)" style={{ transition: 'stroke-dashoffset .5s' }}
      />
      <text x="32" y="36" textAnchor="middle" className="fill-ink text-[13px] font-semibold">
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

function RingCard({ label, pct, sub }: { label: string; pct: number; sub: string }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <Ring pct={pct} />
      <div className="min-w-0">
        <div className="text-sm font-medium text-ink">{label}</div>
        <div className="mt-0.5 text-xs leading-snug text-muted">{sub}</div>
      </div>
    </div>
  );
}

function NetCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-sm font-medium text-ink">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-ink">{value}</div>
    </div>
  );
}

export function MetricsBar() {
  const { data: m } = useQuery({
    queryKey: ['metrics'],
    queryFn: () => api.get<HostMetrics>('/servers/local/metrics'),
    refetchInterval: 3000,
  });

  if (!m) {
    return (
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card h-[88px] animate-pulse p-4" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
      <RingCard label="CPU" pct={m.cpu.pct} sub={`${m.cpu.cores} cores — load ${m.cpu.load.join(', ')}`} />
      <RingCard label="Memória" pct={m.memory.pct} sub={`${gb(m.memory.usedBytes)} / ${gb(m.memory.totalBytes)}`} />
      <RingCard label="Disco" pct={m.disk.pct} sub={`${gb(m.disk.usedBytes)} / ${gb(m.disk.totalBytes)}`} />
      <NetCard label="Entrada de rede" value={bps(m.network.inBps)} />
      <NetCard label="Saída de rede" value={bps(m.network.outBps)} />
    </div>
  );
}
