import { useSyncExternalStore } from 'react';
import { getToasts, subscribe } from '../lib/toast';

const COLORS = {
  success: 'border-ok/40 bg-ok/10 text-ok',
  error: 'border-bad/40 bg-bad/10 text-bad',
  info: 'border-brand/40 bg-brand/10 text-brand-ink',
};

const ICONS = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
};

export function Toasts() {
  const toasts = useSyncExternalStore(subscribe, getToasts);
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-2.5 rounded-lg border px-4 py-2.5 text-sm shadow-pop backdrop-blur-sm ${COLORS[t.level]}`}
        >
          <span className="font-bold">{ICONS[t.level]}</span>
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}
