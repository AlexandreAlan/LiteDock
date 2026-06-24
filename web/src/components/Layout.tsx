import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, type HostMetrics } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { CommandPalette } from './CommandPalette';
import { Icon } from './icons';
import { DEMO } from '../lib/demo';

const NAV = [
  { to: '/', label: 'Projects', end: true, icon: 'grid' as const },
  { to: '/monitor', label: 'Monitor', icon: 'activity' as const },
  { to: '/domains', label: 'Domínios', icon: 'globe' as const },
  { to: '/settings', label: 'Ajustes', icon: 'settings' as const },
];

const LINKS = [
  { label: 'Documentação', href: 'https://github.com/AlexandreAlan/LiteDock', ext: true, icon: 'book' as const },
  { label: 'Registro de alterações', href: '#', ext: false, icon: 'history' as const },
];

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const [palette, setPalette] = useState(false);
  const { data: m } = useQuery({
    queryKey: ['metrics'],
    queryFn: () => api.get<HostMetrics>('/servers/local/metrics'),
    refetchInterval: 5000,
  });
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Record<string, string>>('/settings'),
    staleTime: 60_000,
  });
  const brandName = settings?.brandName?.trim() || 'LiteDock';
  const brandLogo = settings?.brandLogoUrl?.trim();

  // Atalho global ⌘K / Ctrl+K abre a paleta de comandos.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-full">
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      {/* ── Sidebar ───────────────────────────────────────────────── */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-brand text-white">
            {brandLogo ? (
              <img src={brandLogo} alt={brandName} className="h-full w-full object-cover" />
            ) : (
              <Icon name="cube" className="h-[18px] w-[18px]" />
            )}
          </span>
          <div className="leading-tight">
            <div className="text-sm font-bold text-ink">{brandName}</div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted">
              <span>v0.9.0</span>
              <span className="rounded border border-line px-1 text-[10px] leading-tight">PT-BR</span>
            </div>
          </div>
        </div>

        {/* Busca rápida (⌘K) */}
        <div className="px-3 pb-3">
          <button
            onClick={() => setPalette(true)}
            className="flex w-full items-center justify-between rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-muted transition-colors hover:border-brand/40"
          >
            <span className="flex items-center gap-2">
              <Icon name="search" className="h-4 w-4" /> Busca rápida
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
                  isActive ? 'bg-panel2 text-ink' : 'text-ink/70 hover:bg-panel2 hover:text-ink',
                ].join(' ')
              }
            >
              <Icon name={n.icon} className="h-[18px] w-[18px]" />
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
              className="flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:bg-panel2 hover:text-ink"
            >
              <Icon name={l.icon} className="h-4 w-4" />
              {l.label}
            </a>
          ))}
        </nav>

        <div className="mt-auto border-t border-line p-4">
          <div className="mb-3 flex items-center gap-2 text-xs text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" />
            <span className="font-mono font-medium text-ink">{m?.publicIp ?? m?.hostname ?? 'servidor'}</span>
            <span>· {m?.cpu.cores ?? '—'} cores</span>
          </div>
          <div className="mb-3 flex items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-ok/30 bg-ok/10 px-2.5 py-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-ok" />
              <span className="text-xs font-medium text-ok">Deploy ativo</span>
            </div>
            <button
              onClick={toggle}
              title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
              className="ml-auto rounded-lg border border-line p-1.5 text-ink transition-colors hover:bg-panel2"
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} className="h-4 w-4" />
            </button>
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
          <a
            href="https://github.com/AlexandreAlan/LiteDock/releases"
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white shadow-card transition-colors hover:bg-brand-bright"
          >
            <Icon name="refresh" className="h-4 w-4" /> Atualização disponível
          </a>
        </div>
      </aside>

      {/* ── Conteúdo ──────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto bg-bg">
        {DEMO && (
          <div className="flex items-center justify-center gap-2 border-b border-brand/30 bg-brand/10 px-4 py-1.5 text-xs font-medium text-brand-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            Modo demonstração — dados fictícios, nenhum servidor real é afetado
          </div>
        )}
        <div className="px-8 py-7">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
