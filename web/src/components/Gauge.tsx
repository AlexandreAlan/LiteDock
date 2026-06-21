// Assinatura da identidade "Sala de Máquinas": medidor segmentado (gauge).
// Uma fileira de segmentos preenchidos em cobre conforme o valor.

type Tone = 'copper' | 'ok' | 'warn' | 'bad' | 'auto';

const TONE_FILL: Record<Exclude<Tone, 'auto'>, string> = {
  copper: 'bg-copper',
  ok: 'bg-ok',
  warn: 'bg-warn',
  bad: 'bg-bad',
};

function resolveTone(tone: Tone, pct: number): Exclude<Tone, 'auto'> {
  if (tone !== 'auto') return tone;
  if (pct >= 85) return 'bad';
  if (pct >= 65) return 'warn';
  return 'copper';
}

export function Gauge({
  label,
  value,
  max = 100,
  unit = '%',
  segments = 16,
  tone = 'auto',
  size = 'md',
}: {
  label?: string;
  value: number;
  max?: number;
  unit?: string;
  segments?: number;
  tone?: Tone;
  size?: 'sm' | 'md';
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const filled = Math.round((pct / 100) * segments);
  const fill = TONE_FILL[resolveTone(tone, pct)];
  const h = size === 'sm' ? 'h-2.5' : 'h-3.5';

  return (
    <div className="w-full">
      {label && (
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="stamp">{label}</span>
          <span className="font-mono text-sm text-ink/90 tabular-nums">
            {Math.round(value)}
            <span className="text-muted">{unit}</span>
          </span>
        </div>
      )}
      <div className={`flex gap-[3px] ${h}`} role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        {Array.from({ length: segments }).map((_, i) => (
          <span
            key={i}
            className={`flex-1 rounded-[2px] transition-colors ${
              i < filled ? fill : 'bg-copper-dim/25'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
