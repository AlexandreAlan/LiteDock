import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, type Project } from '../lib/api';
import { useTheme } from '../lib/theme';
import { useAuth } from '../lib/auth';

interface Cmd {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  run: () => void;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const { logout } = useAuth();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Projetos e serviços entram na busca (navegar direto), como no EasyPanel.
  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get<Project[]>('/projects'),
    enabled: open,
  });

  const go = (to: string) => {
    navigate(to);
    onClose();
  };

  const commands = useMemo<Cmd[]>(() => {
    const base: Cmd[] = [
      { id: 'projects', label: 'Ir para Projects', icon: '▦', run: () => go('/') },
      { id: 'monitor', label: 'Ir para Monitor', icon: '📈', run: () => go('/monitor') },
      { id: 'domains', label: 'Ir para Domínios', icon: '🌐', run: () => go('/domains') },
      { id: 'settings', label: 'Ir para Ajustes', icon: '⚙️', run: () => go('/settings') },
      {
        id: 'theme',
        label: theme === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo escuro',
        hint: 'tema',
        icon: theme === 'dark' ? '☀️' : '🌙',
        run: () => { toggle(); onClose(); },
      },
      { id: 'logout', label: 'Sair', icon: '⏻', run: () => { logout(); navigate('/login'); onClose(); } },
    ];
    const projCmds: Cmd[] = (projects ?? []).map((p) => ({
      id: `proj-${p.id}`,
      label: p.name,
      hint: 'projeto',
      icon: '📁',
      run: () => go(`/project/${p.id}`),
    }));
    const svcCmds: Cmd[] = (projects ?? []).flatMap((p) =>
      (p.services ?? []).map((s) => ({
        id: `svc-${s.id}`,
        label: s.name,
        hint: p.name,
        icon: s.type === 'database' ? '🗄️' : '📦',
        run: () => go(`/service/${s.id}`),
      })),
    );
    return [...base, ...projCmds, ...svcCmds];
  }, [projects, theme]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(t) || c.hint?.includes(t));
  }, [q, commands]);

  useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => setSel(0), [q]);

  if (!open) return null;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); filtered[sel]?.run(); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-line bg-panel shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-4">
          <span className="text-muted">⌕</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Buscar comando ou projeto…"
            className="w-full bg-transparent py-3 text-sm text-ink outline-none placeholder:text-muted/60"
          />
          <kbd className="rounded border border-line bg-panel2 px-1.5 text-[11px] text-muted">ESC</kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted">Nada encontrado</li>
          )}
          {filtered.map((c, i) => (
            <li key={c.id}>
              <button
                onMouseEnter={() => setSel(i)}
                onClick={c.run}
                className={[
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                  i === sel ? 'bg-brand/10 text-brand' : 'text-ink hover:bg-panel2',
                ].join(' ')}
              >
                <span className="text-base leading-none opacity-80">{c.icon}</span>
                <span className="flex-1">{c.label}</span>
                {c.hint && <span className="text-[11px] text-muted">{c.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
