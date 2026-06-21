import type { ReactNode } from 'react';

// Estados vazios e de erro como direção, não decoração (voz do produto).
export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="plate-2 flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="font-display text-lg text-ink">{title}</div>
      {hint && <p className="max-w-sm font-mono text-xs text-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 font-mono text-sm text-bad">
      {message}
    </div>
  );
}

export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 font-mono text-sm text-muted">
      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-copper border-t-transparent" />
      {label}
    </div>
  );
}

// Selo de pressão do topo — medidorzinho horizontal compacto.
export function PressurePill({ pct, label }: { pct: number; label: string }) {
  const segs = 5;
  const filled = Math.max(1, Math.round((Math.min(100, pct) / 100) * segs));
  const tone = pct >= 85 ? 'bg-bad' : pct >= 65 ? 'bg-warn' : 'bg-ok';
  return (
    <div className="flex items-center gap-2 rounded-md border border-line bg-panel2 px-2.5 py-1.5">
      <span className="stamp">{label}</span>
      <span className="flex h-2 items-center gap-[2px]">
        {Array.from({ length: segs }).map((_, i) => (
          <span key={i} className={`h-2 w-1 rounded-[1px] ${i < filled ? tone : 'bg-copper-dim/25'}`} />
        ))}
      </span>
    </div>
  );
}
