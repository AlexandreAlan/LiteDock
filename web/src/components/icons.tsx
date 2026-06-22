// Ícones de linha (SVG, estilo Lucide) — substituem os emojis pra UI ficar
// limpa e profissional como o EasyPanel. Tudo em currentColor, stroke 2.
import type { SVGProps } from 'react';

type Name =
  | 'grid' | 'activity' | 'globe' | 'settings' | 'search' | 'sun' | 'moon'
  | 'folder' | 'plus' | 'rotate' | 'play' | 'pause' | 'trash' | 'book'
  | 'zap' | 'chevronRight' | 'cube' | 'refresh' | 'externalLink' | 'rocket'
  | 'message' | 'history' | 'layout';

// Ícones que usam preenchimento (silhueta) em vez de traço.
const FILLED: Partial<Record<Name, true>> = { play: true, zap: true };

const PATHS: Record<Name, JSX.Element> = {
  grid: (<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>),
  activity: (<><path d="M3 3v18h18" /><path d="M7 14v3" /><path d="M12 9v8" /><path d="M17 12v5" /></>),
  globe: (<><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" /></>),
  settings: (<><circle cx="12" cy="12" r="2.6" /><circle cx="12" cy="12" r="7" /><path d="M12 5V2.4M12 19v2.6M5 12H2.4M19 12h2.6M16.95 16.95l1.8 1.8M7.05 16.95l-1.8 1.8M16.95 7.05l1.8-1.8M7.05 7.05l-1.8-1.8" /></>),
  search: (<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>),
  sun: (<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19" /></>),
  moon: (<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />),
  folder: (<path d="M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />),
  plus: (<path d="M12 5v14M5 12h14" />),
  rotate: (<><path d="M21 12a9 9 0 1 1-2.6-6.3" /><path d="M21 4v5h-5" /></>),
  play: (<path d="M7 4l13 8-13 8z" />),
  pause: (<><rect x="7" y="5" width="3.2" height="14" rx="1" /><rect x="13.8" y="5" width="3.2" height="14" rx="1" /></>),
  trash: (<><path d="M4 7h16" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></>),
  book: (<><path d="M5 4a2 2 0 0 1 2-2h12v18H7a2 2 0 0 0-2 2z" /><path d="M7 18h12" /></>),
  zap: (<path d="M13 2L4 14h7l-2 8 9-12h-7z" />),
  chevronRight: (<path d="M9 6l6 6-6 6" />),
  cube: (<><path d="M12 2l9 5v10l-9 5-9-5V7z" /><path d="M3 7l9 5 9-5M12 12v10" /></>),
  refresh: (<><path d="M21 12a9 9 0 1 1-2.6-6.3" /><path d="M21 4v5h-5" /></>),
  externalLink: (<><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M19 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" /></>),
  rocket: (<><path d="M5 15c-1 1-1.5 4-1.5 4s3-.5 4-1.5" /><path d="M9 11a10 10 0 0 1 8-6c2 0 3 1 3 3a10 10 0 0 1-6 8l-3 1-3-3z" /><circle cx="14.5" cy="9.5" r="1.5" /></>),
  message: (<path d="M21 11.5a8.4 8.4 0 0 1-11.9 7.6L3 21l1.9-6A8.4 8.4 0 1 1 21 11.5z" />),
  history: (<><path d="M3 12a9 9 0 1 0 2.6-6.3L3 8" /><path d="M3 4v4h4" /><path d="M12 8v4l3 2" /></>),
  layout: (<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>),
};

export function Icon({ name, className = 'h-4 w-4', ...rest }: { name: Name } & SVGProps<SVGSVGElement>) {
  const filled = FILLED[name];
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
