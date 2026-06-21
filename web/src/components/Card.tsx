import type { ReactNode } from 'react';

// Placa de metal: superfície elevada com rótulo cravado opcional.
export function Card({
  title,
  right,
  children,
  className = '',
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`plate p-4 ${className}`}>
      {(title || right) && (
        <header className="mb-3 flex items-center justify-between border-b border-line pb-2">
          {title && <h2 className="stamp">{title}</h2>}
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

// Número grande com rótulo cravado — métrica de placar.
export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="plate-2 p-4">
      <div className="stamp mb-2">{label}</div>
      <div className="font-display text-3xl font-semibold leading-none text-ink tabular-nums">
        {value}
      </div>
      {hint && <div className="mt-1 font-mono text-xs text-muted">{hint}</div>}
    </div>
  );
}
