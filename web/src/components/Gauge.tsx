// Barra de progresso lisa (estilo EasyPanel): trilho claro + preenchimento azul/verde/âmbar/vermelho.

type Tone = 'brand' | 'ok' | 'warn' | 'bad' | 'auto';

const TONE_FILL: Record<Exclude<Tone, 'auto'>, string> = {
  brand: 'bg-brand',
  ok: 'bg-ok',
  warn: 'bg-warn',
  bad: 'bg-bad',
};

function resolveTone(tone: Tone, pct: number): Exclude<Tone, 'auto'> {
  if (tone !== 'auto') return tone;
  if (pct >= 85) return 'bad';
  if (pct >= 65) return 'warn';
  return 'brand';
}

export function Gauge({
  label,
  value,
  max = 100,
  unit = '%',
  tone = 'auto',
  size = 'md',
}: {
  label?: string;
  value: number;
  max?: number;
  unit?: string;
  tone?: Tone;
  size?: 'sm' | 'md';
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const fill = TONE_FILL[resolveTone(tone, pct)];
  const h = size === 'sm' ? 'h-1.5' : 'h-2';

  return (
    <div className="w-full">
      {label && (
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="label">{label}</span>
          <span className="text-sm tabular-nums text-ink">
            {Math.round(value)}
            <span className="text-muted">{unit}</span>
          </span>
        </div>
      )}
      <div
        className={`w-full overflow-hidden rounded-full bg-panel2 ${h}`}
        role="meter"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className={`h-full rounded-full ${fill} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
