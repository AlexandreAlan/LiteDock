import type { ServiceType } from '../lib/api';

// Badge de tipo verde, estilo EasyPanel (APP / POSTGRES / REDIS...).
export function TypeBadge({ type, spec }: { type: ServiceType; spec?: Record<string, unknown> }) {
  const engine = (spec?.engine as string) || (spec?.image as string) || '';
  const label =
    type === 'app'
      ? 'APP'
      : (engine ? engine.split(':')[0].split('/').pop() : 'database')!.toUpperCase();
  return (
    <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-ink">
      {label}
    </span>
  );
}

// Quadradinho com a inicial do serviço (placeholder do logo, estilo EasyPanel).
export function ServiceGlyph({ type, name }: { type: ServiceType; name: string }) {
  const ch = (name || '?').charAt(0).toUpperCase();
  const cls = type === 'app' ? 'bg-brand/10 text-brand-ink' : 'bg-amber-100 text-amber-700';
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ${cls}`}>
      {ch}
    </span>
  );
}
