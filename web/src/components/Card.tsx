import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

// Curva de easing premium (out-expo suave) reutilizada nas entradas.
const EASE = [0.22, 1, 0.36, 1] as const;

// Placa elevada com rótulo opcional. Entra com fade + leve subida.
export function Card({
  title,
  subtitle,
  right,
  children,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className={`plate p-4 ${className}`}
    >
      {(title || right) && (
        <header className="mb-3 flex items-start justify-between gap-3 border-b border-line pb-2">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      {children}
    </motion.section>
  );
}

// Número grande com rótulo — métrica de placar. Sobe suave e reage ao hover.
export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      whileHover={{ y: -2 }}
      className="plate-2 p-4"
    >
      <div className="stamp mb-2">{label}</div>
      <div className="font-display text-3xl font-semibold leading-none text-ink tabular-nums">
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </motion.div>
  );
}
