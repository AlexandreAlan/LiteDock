import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, type EngineInfo } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PressurePill } from './ui';

const NAV = [
  { to: '/', label: 'Painel', end: true },
  { to: '/apps', label: 'Apps' },
  { to: '/catalogo', label: 'Catálogo' },
  { to: '/vps', label: 'VPS' },
];

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const { data: engine } = useQuery({
    queryKey: ['engine'],
    queryFn: () => api.get<EngineInfo>('/servers/local/engine'),
    refetchInterval: 15_000,
  });

  const total = engine?.containers ?? 0;
  const running = engine?.containersRunning ?? 0;
  const loadPct = total ? Math.round((running / total) * 100) : 0;

  return (
    <div className="flex h-full">
      {/* ── Sidebar ───────────────────────────────────────────────── */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex items-center gap-3 border-b border-line px-5 py-5">
          <span className="text-2xl">🐳</span>
          <div className="leading-tight">
            <div className="font-display text-lg font-bold text-ink">
              LITEDOCK
            </div>
            <div className="stamp">casa de máquinas</div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                [
                  'group flex items-center gap-3 rounded-md px-3 py-2 font-display text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand/10 text-brand'
                    : 'text-muted hover:bg-panel2 hover:text-ink',
                ].join(' ')
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-line px-4 py-4">
          <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-brand-dim/40 bg-brand/10 px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            <span className="stamp text-brand-bright">modo seguro</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="truncate font-mono text-xs text-ink">
                {user?.name || user?.email}
              </div>
              <div className="stamp">{user?.role}</div>
            </div>
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="btn-ghost px-2 py-1 text-xs"
              title="Sair"
            >
              sair
            </button>
          </div>
        </div>
      </aside>

      {/* ── Conteúdo ──────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line bg-panel/60 px-6 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="stamp">pressão do sistema</span>
            <span className="font-mono text-xs text-muted">
              {running}/{total} unidades
            </span>
          </div>
          <PressurePill pct={loadPct} label="carga" />
        </header>

        <main className="flex-1 overflow-y-auto bg-bg px-6 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
