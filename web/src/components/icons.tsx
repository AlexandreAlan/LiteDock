// Ícones de linha (SVG, estilo Lucide) — substituem os emojis pra UI ficar
// limpa e profissional como o EasyPanel. Tudo em currentColor, stroke 2.
import type { SVGProps } from 'react';

type Name =
  | 'grid' | 'activity' | 'globe' | 'settings' | 'search' | 'sun' | 'moon'
  | 'folder' | 'plus' | 'rotate' | 'play' | 'pause' | 'trash' | 'book'
  | 'zap' | 'chevronRight' | 'cube' | 'refresh' | 'externalLink' | 'rocket'
  | 'message' | 'history' | 'layout' | 'eye' | 'eyeOff' | 'shield' | 'user'
  | 'chevronDown' | 'copy' | 'check' | 'info' | 'server' | 'docker' | 'pencil'
  | 'users' | 'terminal'
  // novos
  | 'database' | 'git' | 'network' | 'x' | 'cpu' | 'link' | 'filter'
  | 'download' | 'upload' | 'clock' | 'alert' | 'flame' | 'key'
  | 'chevronLeft' | 'chevronUp' | 'maximize' | 'minimize' | 'share'
  | 'wifi' | 'lock' | 'unlock' | 'list' | 'grip';

// Ícones que usam preenchimento (silhueta) em vez de traço.
const FILLED: Partial<Record<Name, true>> = { play: true, zap: true };

const PATHS: Record<Name, JSX.Element> = {
  // ── existentes ──────────────────────────────────────────────────────────────
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
  eye: (<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>),
  eyeOff: (<><path d="M3 3l18 18" /><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.3 4.1M6.6 6.6A17.6 17.6 0 0 0 2 12s3.5 7 10 7a10.9 10.9 0 0 0 3.9-.7" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>),
  shield: (<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />),
  user: (<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>),
  chevronDown: (<path d="M6 9l6 6 6-6" />),
  copy: (<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>),
  check: (<path d="M20 6L9 17l-5-5" />),
  info: (<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>),
  server: (<><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M7 7.5h.01M7 16.5h.01" /></>),
  docker: (<><rect x="3" y="10" width="3" height="3" /><rect x="7" y="10" width="3" height="3" /><rect x="11" y="10" width="3" height="3" /><rect x="7" y="6" width="3" height="3" /><path d="M2 13c0 4 3 6 8 6 6 0 9-3 10-7 1 1 2 1 3 0" /></>),
  pencil: (<><path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z" /></>),
  users: (<><circle cx="9" cy="8" r="4" /><path d="M2 21c0-4 3.1-6 7-6s7 2 7 6" /><path d="M19 8c1.7 0 3 1.3 3 3s-1.3 3-3 3" /><path d="M22 21c0-3-1.3-4.5-3-5" /></>),
  terminal: (<><path d="M4 17l6-6-6-6" /><path d="M12 19h8" /></>),
  // ── novos ───────────────────────────────────────────────────────────────────
  database: (<><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 5v4c0 1.7-4 3-9 3s-9-1.3-9-3V5" /><path d="M3 9v5c0 1.7 4 3 9 3s9-1.3 9-3V9" /><path d="M3 14v5c0 1.7 4 3 9 3s9-1.3 9-3v-5" /></>),
  git: (<><circle cx="6" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><circle cx="18" cy="6" r="3" /><path d="M6 9v6M6 9a6 6 0 0 0 6 6h1a3 3 0 0 1 3 3" /></>),
  network: (<><rect x="9" y="2" width="6" height="5" rx="1" /><rect x="2" y="17" width="6" height="5" rx="1" /><rect x="16" y="17" width="6" height="5" rx="1" /><path d="M12 7v4M8.5 21H5.5m13 0h-3M4 17v-3a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3" /></>),
  x: (<path d="M18 6L6 18M6 6l12 12" />),
  cpu: (<><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" /></>),
  link: (<><path d="M10 13a5 5 0 0 0 7.5.7l3-3a5 5 0 0 0-7-7.1l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.7l-3 3a5 5 0 0 0 7 7.1l1.7-1.7" /></>),
  filter: (<path d="M22 3H2l8 9.5V19l4 2v-8.5z" />),
  download: (<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></>),
  upload: (<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" /></>),
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></>),
  alert: (<><path d="M10.3 3.5L2 20h20L13.7 3.5a2 2 0 0 0-3.4 0z" /><path d="M12 10v4M12 17h.01" /></>),
  flame: (<path d="M8.5 14.5c-.5-2 .5-4 2.5-5.5 0 2 1 3.5 2.5 4.5 0-2 1-3.5 2.5-4.5 1 1.5 1 5-1 7a5 5 0 0 1-6.5-1.5z" />),
  key: (<><path d="M21 2l-2 2m-7.6 7.6a5 5 0 1 1-7 7 5 5 0 0 1 7-7l7-7" /><path d="M15 7l3 3" /></>),
  chevronLeft: (<path d="M15 18l-6-6 6-6" />),
  chevronUp: (<path d="M18 15l-6-6-6 6" />),
  maximize: (<><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></>),
  minimize: (<><path d="M8 3v5H3M21 8h-5V3M3 16h5v5M16 21v-5h5" /></>),
  share: (<><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></>),
  wifi: (<><path d="M5 12.5a9.5 9.5 0 0 1 14 0" /><path d="M8.5 16a5.5 5.5 0 0 1 7 0" /><circle cx="12" cy="19.5" r="1" /></>),
  lock: (<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>),
  unlock: (<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0" /></>),
  list: (<><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></>),
  grip: (<><path d="M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01" strokeWidth="2.5" strokeLinecap="round" /></>),
};

export type { Name as IconName };

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
