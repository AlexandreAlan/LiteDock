// Estado de uma unidade (container/serviço) como "boia" cravada.

const MAP: Record<string, { dot: string; ring: string; label: string }> = {
  running: { dot: 'bg-ok', ring: 'shadow-[0_0_0_3px_rgba(127,166,80,0.18)]', label: 'no ar' },
  online: { dot: 'bg-ok', ring: 'shadow-[0_0_0_3px_rgba(127,166,80,0.18)]', label: 'no ar' },
  restarting: { dot: 'bg-warn', ring: 'shadow-[0_0_0_3px_rgba(217,164,65,0.18)]', label: 'reiniciando' },
  paused: { dot: 'bg-warn', ring: 'shadow-[0_0_0_3px_rgba(217,164,65,0.18)]', label: 'pausado' },
  exited: { dot: 'bg-bad', ring: 'shadow-[0_0_0_3px_rgba(194,90,64,0.18)]', label: 'parado' },
  stopped: { dot: 'bg-bad', ring: 'shadow-[0_0_0_3px_rgba(194,90,64,0.18)]', label: 'parado' },
  dead: { dot: 'bg-bad', ring: 'shadow-[0_0_0_3px_rgba(194,90,64,0.18)]', label: 'morto' },
};

export function StatusDot({ state, withLabel = false }: { state?: string | null; withLabel?: boolean }) {
  const key = (state || '').toLowerCase();
  const s = MAP[key] || { dot: 'bg-muted', ring: '', label: state || 'desconhecido' };
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${s.dot} ${s.ring}`} />
      {withLabel && <span className="font-mono text-xs text-muted">{s.label}</span>}
    </span>
  );
}
