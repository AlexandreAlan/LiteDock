import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
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
  { label: 'Registro de alterações', href: 'https://github.com/AlexandreAlan/LiteDock/releases', ext: true, icon: 'history' as const },
];

function semverGt(a: string, b: string): boolean {
  const parse = (s: string) => s.replace(/^v/, '').split('.').map(Number);
  const [a1, a2, a3] = parse(a);
  const [b1, b2, b3] = parse(b);
  return a1 !== b1 ? a1 > b1 : a2 !== b2 ? a2 > b2 : a3 > b3;
}

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
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
  const { data: versionInfo } = useQuery({
    queryKey: ['version'],
    queryFn: () => api.get<{ version: string }>('/servers/local/version'),
    staleTime: 300_000,
  });
  const { data: ghRelease } = useQuery({
    queryKey: ['gh-release'],
    queryFn: async () => {
      const r = await fetch('https://api.github.com/repos/AlexandreAlan/LiteDock/releases/latest', {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!r.ok) return null;
      return r.json() as Promise<{ tag_name: string } | null>;
    },
    staleTime: 3_600_000,
    retry: false,
  });

  const currentVersion = versionInfo?.version ?? null;
  const latestTag = ghRelease?.tag_name ?? null;
  const hasUpdate = !!(currentVersion && latestTag && semverGt(latestTag.replace(/^v/, ''), currentVersion));

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
              {currentVersion && <span>v{currentVersion}</span>}
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
                  isActive
                    ? 'bg-brand/10 text-ink ring-1 ring-inset ring-brand/25'
                    : 'text-ink/70 hover:bg-panel2 hover:text-ink',
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
          {m && (
            <div className="mb-3 space-y-1.5">
              {([
                { label: 'CPU', pct: m.cpu.pct },
                { label: 'RAM', pct: m.memory.pct },
                { label: 'Disco', pct: m.disk.pct },
              ] as const).map(({ label, pct }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="w-8 text-[10px] text-muted">{label}</span>
                  <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-panel2">
                    <div
                      className={`absolute inset-y-0 left-0 rounded-full transition-all ${pct >= 90 ? 'bg-bad' : pct >= 75 ? 'bg-warn' : 'bg-ok'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className={`w-9 text-right text-[10px] tabular-nums ${pct >= 90 ? 'text-bad' : pct >= 75 ? 'text-warn' : 'text-muted'}`}>
                    {pct.toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          )}
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
          {hasUpdate && (
            <a
              href={`https://github.com/AlexandreAlan/LiteDock/releases/tag/${latestTag}`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white shadow-card transition-colors hover:bg-brand-bright"
            >
              <Icon name="refresh" className="h-4 w-4" /> {latestTag} disponível
            </a>
          )}
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
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="px-8 py-7"
        >
          <Outlet />
        </motion.div>
      </main>
    </div>
  );
}
