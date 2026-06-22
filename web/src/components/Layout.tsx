import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, type HostMetrics } from '../lib/api';
import { useAuth } from '../lib/auth';

const NAV = [
  { to: '/', label: 'Projects', end: true, icon: '▦' },
  { to: '/monitor', label: 'Monitor', icon: '📈' },
  { to: '/domains', label: 'Domínios', icon: '🌐' },
  { to: '/settings', label: 'Ajustes', icon: '⚙️' },
];

const LINKS = [
  { label: 'Documentação', href: 'https://github.com/AlexandreAlan/LiteDock', ext: true },
  { label: 'Discord', href: 'https://discord.com', ext: true },
  { label: 'Comentários', href: '#', ext: false },
  { label: 'Registro de alterações', href: '#', ext: false },
];

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { data: m } = useQuery({
    queryKey: ['metrics'],
    queryFn: () => api.get<HostMetrics>('/servers/local/metrics'),
    refetchInterval: 5000,
  });

  return (
    <div className="flex h-full">
      {/* ── Sidebar ───────────────────────────────────────────────── */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <span className="text-xl">🐳</span>
          <div className="leading-tight">
            <div className="text-sm font-bold text-ink">LiteDock</div>
            <div className="text-[11px] text-muted">v0.2.0</div>
          </div>
        </div>

        {/* Busca rápida (⌘K) */}
        <div className="px-3 pb-3">
          <button className="flex w-full items-center justify-between rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-muted transition-colors hover:border-brand/40">
            <span className="flex items-center gap-2">
              <span className="text-muted">⌕</span> Busca rápida
            </span>
            <kbd className="rounded border border-line bg-panel px-1.5 text-[11px]">⌘K</kbd>
          </button>
        </div>

        <nav className="flex flex-col gap-0.5 px-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                [
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-brand/10 text-brand' : 'text-ink/70 hover:bg-panel2 hover:text-ink',
                ].join(' ')
              }
            >
              <span className="text-base leading-none opacity-80">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="my-3 border-t border-line" />

        <nav className="flex flex-col gap-0.5 px-3">
          {LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target={l.ext ? '_blank' : undefined}
              rel={l.ext ? 'noreferrer' : undefined}
              className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:bg-panel2 hover:text-ink"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="mt-auto border-t border-line p-4">
          <div className="mb-3 flex items-center gap-2 text-xs text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" />
            <span className="font-medium text-ink">{m?.hostname ?? 'servidor'}</span>
            <span>· {m?.cpu.cores ?? '—'} cores</span>
          </div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-2.5 py-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            <span className="text-xs font-medium text-brand-ink">Modo seguro</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="truncate text-sm text-ink">{user?.name || user?.email}</div>
              <div className="text-xs text-muted">{user?.role}</div>
            </div>
            <button
              onClick={() => { logout(); navigate('/login'); }}
              className="rounded-lg border border-line px-2.5 py-1 text-xs text-ink hover:bg-panel2"
            >
              Sair
            </button>
          </div>
        </div>
      </aside>

      {/* ── Conteúdo ──────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto bg-bg px-8 py-7">
        <Outlet />
      </main>
    </div>
  );
}
