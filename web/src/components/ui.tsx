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
      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      {label}
    </div>
  );
}

// Selo de status do topo — chip limpo com bolinha de cor + percentual.
export function PressurePill({ pct, label }: { pct: number; label: string }) {
  const dot = pct >= 85 ? 'bg-bad' : pct >= 65 ? 'bg-warn' : 'bg-ok';
  return (
    <div className="flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 shadow-card">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      <span className="text-xs text-muted">{label}</span>
      <span className="font-mono text-xs tabular-nums text-ink">{Math.round(pct)}%</span>
    </div>
  );
}
