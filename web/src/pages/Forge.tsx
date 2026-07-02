import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getToken } from '../lib/api';
import { Icon } from '../components/icons';
import { toast } from '../lib/toast';

// ─── tipos ───────────────────────────────────────────────────────────────────
type Stack = 'Next.js' | 'React' | 'Vite' | 'Astro' | 'Fastify' | 'Express'
  | 'Node.js' | 'FastAPI' | 'Django' | 'Flask' | 'Python' | 'Go'
  | 'Docker Compose' | 'Static';

interface Project {
  slug: string; name: string; path: string;
  stacks: Stack[]; devCmd: string | null; port: number | null;
  git: { branch: string; commit: string | null; dirty: boolean; ahead: number } | null;
}

// ─── cores das stacks ─────────────────────────────────────────────────────────
const STACK_COLOR: Record<string, string> = {
  'Next.js': 'bg-zinc-800 text-zinc-100',
  'React': 'bg-sky-900 text-sky-300',
  'Vite': 'bg-purple-900 text-purple-300',
  'Fastify': 'bg-emerald-900 text-emerald-300',
  'Express': 'bg-neutral-700 text-neutral-200',
  'Node.js': 'bg-green-900 text-green-300',
  'FastAPI': 'bg-teal-900 text-teal-300',
  'Django': 'bg-green-950 text-green-400',
  'Flask': 'bg-slate-700 text-slate-200',
  'Python': 'bg-blue-900 text-blue-300',
  'Go': 'bg-cyan-900 text-cyan-300',
  'Docker Compose': 'bg-blue-800 text-blue-200',
  'Static': 'bg-zinc-700 text-zinc-300',
  'Astro': 'bg-orange-900 text-orange-300',
};

function StackBadge({ stack }: { stack: Stack }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STACK_COLOR[stack] ?? 'bg-zinc-700 text-zinc-200'}`}>
      {stack}
    </span>
  );
}

// ─── Modal: Publicar ──────────────────────────────────────────────────────────
function DeployModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const baseName = project.slug.split('/').pop() ?? project.slug;
  const [serviceName, setServiceName] = useState(baseName);
  const [port, setPort] = useState(String(project.port ?? 3000));
  const [runtime, setRuntime] = useState<'pm2' | 'container'>('pm2');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ ok: boolean; msg: string } | null>(null);

  const submit = async () => {
    setLoading(true);
    try {
      await api.post('/devspace/publish', {
        path: project.path,
        name: serviceName,
        port: Number(port) || (project.port ?? 3000),
        runtime,
      });
      setDone({
        ok: true,
        msg: runtime === 'pm2'
          ? `Processo "${serviceName}" iniciado no PM2 com sucesso.`
          : `Serviço "${serviceName}" criado no LiteDock com sucesso.`,
      });
      toast.success(`${serviceName} publicado!`);
    } catch (e) {
      setDone({ ok: false, msg: (e as Error).message });
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-[500px] rounded-2xl border border-line bg-panel shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-line px-6 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand/20">
            <Icon name="rocket" className="h-4 w-4 text-brand" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ink">Publicar projeto</h2>
            <p className="text-[11px] text-muted mt-0.5">Registra o projeto existente no servidor</p>
          </div>
          <button onClick={onClose} className="ml-auto rounded-lg p-1.5 text-muted hover:bg-panel2">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* Path do projeto (somente leitura) */}
          <div className="rounded-xl border border-line bg-panel2 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <Icon name="folder" className="h-3.5 w-3.5 text-brand" />
              <span className="text-xs font-semibold text-ink">Projeto</span>
            </div>
            <code className="text-[12px] text-brand font-mono block truncate">{project.path}</code>
            <div className="mt-2 flex flex-wrap gap-1">
              {project.stacks.map((s) => <StackBadge key={s} stack={s} />)}
            </div>
          </div>

          {done ? (
            <div className={`rounded-xl border px-4 py-4 text-sm ${done.ok ? 'border-ok/30 bg-ok/10 text-ok' : 'border-bad/30 bg-bad/10 text-bad'}`}>
              {done.ok ? '✓ ' : '✗ '}{done.msg}
            </div>
          ) : (
            <>
              {/* Nome do serviço */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink">Nome do serviço</label>
                <input
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  className="w-full rounded-xl border border-line bg-panel2 px-3.5 py-2.5 text-sm text-ink focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/20"
                />
              </div>

              {/* Porta */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink">Porta da aplicação</label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  className="w-full rounded-xl border border-line bg-panel2 px-3.5 py-2.5 text-sm text-ink focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/20"
                />
                {project.devCmd && (
                  <p className="mt-1 text-[11px] text-muted">Dev: <code className="text-brand">{project.devCmd}</code></p>
                )}
              </div>

              {/* Modo */}
              <div>
                <label className="mb-2 block text-xs font-semibold text-ink">Como rodar</label>
                <div className="space-y-2">
                  {([
                    { id: 'pm2',       icon: 'play' as const,   label: 'PM2 — processo no host',     desc: 'Inicia agora e reinicia automaticamente com a VPS' },
                    { id: 'container', icon: 'docker' as const, label: 'Container (LiteDock)',        desc: 'Cria projeto + serviço Docker com ingress e SSL automático' },
                  ] as const).map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setRuntime(r.id)}
                      className={[
                        'flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all',
                        runtime === r.id
                          ? 'border-brand/50 bg-brand/10 ring-1 ring-brand/25'
                          : 'border-line bg-panel2 hover:border-brand/25',
                      ].join(' ')}
                    >
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${runtime === r.id ? 'bg-brand/20' : 'bg-panel'}`}>
                        <Icon name={r.icon} className={`h-4 w-4 ${runtime === r.id ? 'text-brand' : 'text-muted'}`} />
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-ink">{r.label}</div>
                        <div className="text-[10px] text-muted">{r.desc}</div>
                      </div>
                      <div className={`h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${runtime === r.id ? 'border-brand bg-brand' : 'border-muted/40'}`}>
                        {runtime === r.id && <div className="h-2 w-2 rounded-full bg-white" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <button onClick={onClose} className="rounded-xl border border-line px-4 py-2 text-sm text-ink hover:bg-panel2">
            {done ? 'Fechar' : 'Cancelar'}
          </button>
          {!done && (
            <button
              onClick={submit}
              disabled={!serviceName || loading}
              className="flex items-center gap-2 rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-40"
            >
              {loading
                ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                : <Icon name="rocket" className="h-4 w-4" />}
              Publicar agora
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Novo Projeto ──────────────────────────────────────────────────────
type TemplateCategory = 'backend' | 'frontend' | 'python' | 'outros';

interface TemplateInfo {
  id: string; label: string; desc: string; category: TemplateCategory;
  devCmd: string | null; port: number | null; baseFiles: string[];
  ring: string; dot: string;
}

const TEMPLATES: TemplateInfo[] = [
  { id: 'node-api',       label: 'Node.js API',    desc: 'HTTP nativo, zero deps',          category: 'backend',  devCmd: 'npm run dev',               port: 3000, baseFiles: ['package.json', 'index.js'],                                              ring: 'ring-green-500/40 bg-green-950/30 border-green-700/50',      dot: 'bg-green-400' },
  { id: 'fastify',        label: 'Fastify',         desc: 'API Node moderna e veloz',        category: 'backend',  devCmd: 'npm run dev',               port: 3000, baseFiles: ['package.json', 'server.js'],                                             ring: 'ring-emerald-500/40 bg-emerald-950/30 border-emerald-700/50', dot: 'bg-emerald-400' },
  { id: 'express',        label: 'Express',         desc: 'Framework minimalista Node',      category: 'backend',  devCmd: 'npm start',                 port: 3000, baseFiles: ['package.json', 'index.js'],                                              ring: 'ring-zinc-400/40 bg-zinc-800/30 border-zinc-600/50',          dot: 'bg-zinc-300' },
  { id: 'react-vite',     label: 'React + Vite',    desc: 'SPA moderna com TypeScript',      category: 'frontend', devCmd: 'npm run dev',               port: 5173, baseFiles: ['package.json', 'index.html', 'vite.config.ts', 'src/App.tsx', 'src/main.tsx'], ring: 'ring-sky-500/40 bg-sky-950/30 border-sky-700/50',          dot: 'bg-sky-400' },
  { id: 'next',           label: 'Next.js 15',      desc: 'App Router + SSR/SSG',            category: 'frontend', devCmd: 'npm run dev',               port: 3000, baseFiles: ['package.json', 'next.config.js', 'app/page.tsx', 'app/layout.tsx'],      ring: 'ring-zinc-300/40 bg-zinc-900/20 border-zinc-500/50',          dot: 'bg-white' },
  { id: 'astro',          label: 'Astro',           desc: 'Conteúdo estático ultrarrápido',  category: 'frontend', devCmd: 'npm run dev',               port: 4321, baseFiles: ['package.json', 'astro.config.mjs', 'src/pages/index.astro'],            ring: 'ring-orange-500/40 bg-orange-950/30 border-orange-700/50',    dot: 'bg-orange-400' },
  { id: 'static',         label: 'HTML Estático',   desc: 'HTML + CSS + JS puro',            category: 'frontend', devCmd: null,                        port: null,  baseFiles: ['index.html', 'style.css', 'script.js'],                                  ring: 'ring-amber-500/40 bg-amber-950/30 border-amber-700/50',       dot: 'bg-amber-400' },
  { id: 'fastapi',        label: 'FastAPI',         desc: 'API Python assíncrona',           category: 'python',   devCmd: 'uvicorn main:app --reload', port: 8000, baseFiles: ['main.py', 'requirements.txt'],                                            ring: 'ring-teal-500/40 bg-teal-950/30 border-teal-700/50',          dot: 'bg-teal-400' },
  { id: 'flask',          label: 'Flask',           desc: 'Micro-framework Python',          category: 'python',   devCmd: 'flask run',                 port: 5000, baseFiles: ['app.py', 'requirements.txt'],                                            ring: 'ring-blue-500/40 bg-blue-950/30 border-blue-700/50',          dot: 'bg-blue-400' },
  { id: 'django-lite',    label: 'Django',          desc: 'Full-stack Python clássico',      category: 'python',   devCmd: 'python manage.py runserver', port: 8000, baseFiles: ['manage.py', 'requirements.txt', 'core/settings.py', 'core/urls.py'],    ring: 'ring-green-600/40 bg-green-950/40 border-green-800/50',        dot: 'bg-green-500' },
  { id: 'go-api',         label: 'Go API',          desc: 'net/http nativo, ultra-rápido',   category: 'outros',   devCmd: 'go run main.go',            port: 8080, baseFiles: ['go.mod', 'main.go'],                                                     ring: 'ring-cyan-500/40 bg-cyan-950/30 border-cyan-700/50',           dot: 'bg-cyan-400' },
  { id: 'docker-compose', label: 'Compose',         desc: 'Orquestração multi-container',    category: 'outros',   devCmd: 'docker compose up',         port: null,  baseFiles: ['docker-compose.yml', '.env.example'],                                    ring: 'ring-blue-600/40 bg-blue-950/40 border-blue-800/50',           dot: 'bg-blue-500' },
];

const CAT_LABELS: Record<TemplateCategory, string> = {
  backend: 'Backend', frontend: 'Frontend', python: 'Python', outros: 'Outros',
};

type Node = { [k: string]: Node | null };

function FileTree({ name, files }: { name: string; files: string[] }) {
  const root: Node = {};
  for (const f of files) {
    const parts = f.split('/');
    let cur: Node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]]) cur[parts[i]] = {};
      cur = cur[parts[i]] as Node;
    }
    cur[parts[parts.length - 1]] = null;
  }
  function renderNode(node: Node, prefix = ''): JSX.Element[] {
    const entries = Object.entries(node);
    return entries.flatMap(([key, child], idx) => {
      const last = idx === entries.length - 1;
      const isDir = child !== null;
      return [
        <div key={`${prefix}${key}`} className="flex items-center gap-1 leading-5">
          <span className="text-zinc-600 font-mono text-[11px] select-none">{prefix}{last ? '└─' : '├─'}</span>
          {isDir
            ? <span className="text-sky-400 text-[11px]"><Icon name="folder" className="inline h-3 w-3 mr-0.5 -mt-0.5" />{key}/</span>
            : <span className="text-zinc-400 text-[11px]">{key}</span>}
        </div>,
        ...(isDir && child ? renderNode(child, prefix + (last ? '   ' : '│  ')) : []),
      ];
    });
  }
  return (
    <div className="font-mono">
      <div className="flex items-center gap-1 mb-0.5">
        <Icon name="folder" className="h-3.5 w-3.5 text-brand" />
        <span className="text-[12px] font-semibold text-brand">{name || 'meu-projeto'}/</span>
      </div>
      {renderNode(root)}
    </div>
  );
}

interface CreateExtras { withGit: boolean; withReadme: boolean; withEnv: boolean; }

function NewProjectModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (name: string, template: string, runtime: string, extras: CreateExtras) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [tpl, setTpl] = useState<TemplateInfo>(TEMPLATES[1]);
  const [category, setCategory] = useState<TemplateCategory>('backend');
  const [runtime, setRuntime] = useState<'none' | 'pm2' | 'container'>('none');
  const [withGit, setWithGit] = useState(true);
  const [withReadme, setWithReadme] = useState(true);
  const [withEnv, setWithEnv] = useState(false);
  const [showExtras, setShowExtras] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const nameValid = name.length >= 2 && /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(name);
  const catTemplates = TEMPLATES.filter((t) => t.category === category);
  const previewFiles = [...tpl.baseFiles, ...(withGit ? ['.gitignore'] : []), ...(withEnv ? ['.env'] : []), ...(withReadme ? ['README.md'] : [])];

  const handleNameInput = (v: string) =>
    setName(v.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+/, '').replace(/-{2,}/g, '-'));

  const submit = async () => {
    if (!nameValid) return;
    setLoading(true); setErr('');
    try { await onCreate(name, tpl.id, runtime, { withGit, withReadme, withEnv }); onClose(); }
    catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="flex w-[760px] max-h-[88vh] flex-col rounded-2xl border border-line bg-panel shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line px-6 py-4 shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand/20">
            <Icon name="plus" className="h-4 w-4 text-brand" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ink">Novo Projeto</h2>
            <p className="text-[11px] text-muted leading-none mt-0.5">Cria em /var/www e opcionalmente publica</p>
          </div>
          <button onClick={onClose} className="ml-auto rounded-lg p-1.5 text-muted hover:bg-panel2">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Esquerda */}
          <div className="flex w-[440px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-line p-5">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink">Nome do projeto</label>
              <input autoFocus value={name} onChange={(e) => handleNameInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && nameValid) submit(); }}
                placeholder="meu-projeto"
                className="w-full rounded-xl border border-line bg-panel2 px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/20" />
              {name && !nameValid && <p className="mt-1 text-[11px] text-bad">Mín. 2 chars: letras minúsculas, números e hífens</p>}
              {nameValid && <p className="mt-1 text-[11px] text-muted"><code className="text-brand font-mono">/var/www/{name}</code></p>}
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold text-ink">Template inicial</label>
              <div className="flex gap-1 rounded-xl bg-panel2 p-1 mb-3">
                {(Object.keys(CAT_LABELS) as TemplateCategory[]).map((cat) => (
                  <button key={cat} onClick={() => setCategory(cat)}
                    className={['flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-all', category === cat ? 'bg-panel shadow text-ink' : 'text-muted hover:text-ink'].join(' ')}>
                    {CAT_LABELS[cat]}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {catTemplates.map((t) => (
                  <button key={t.id} onClick={() => setTpl(t)}
                    className={['flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all', tpl.id === t.id ? `${t.ring} ring-2` : 'border-line bg-panel2 hover:border-brand/30'].join(' ')}>
                    <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${t.dot}`} />
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold text-ink truncate">{t.label}</div>
                      <div className="text-[10px] text-muted leading-snug mt-0.5">{t.desc}</div>
                    </div>
                    {tpl.id === t.id && <Icon name="check" className="ml-auto mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold text-ink">Como executar</label>
              <div className="space-y-1.5">
                {([
                  { id: 'none', icon: 'folder' as const, label: 'Só criar a pasta', desc: 'Você decide quando e como rodar' },
                  { id: 'pm2', icon: 'play' as const, label: 'PM2 — processo no host', desc: 'Inicia agora e reinicia automaticamente' },
                  { id: 'container', icon: 'docker' as const, label: 'Container (LiteDock)', desc: 'Cria projeto + serviço Docker com ingress automático' },
                ] as const).map((r) => (
                  <button key={r.id} onClick={() => setRuntime(r.id)}
                    className={['flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all', runtime === r.id ? 'border-brand/50 bg-brand/10 ring-1 ring-brand/25' : 'border-line bg-panel2 hover:border-brand/25'].join(' ')}>
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${runtime === r.id ? 'bg-brand/20' : 'bg-panel'}`}>
                      <Icon name={r.icon} className={`h-4 w-4 ${runtime === r.id ? 'text-brand' : 'text-muted'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-ink">{r.label}</div>
                      <div className="text-[10px] text-muted leading-snug">{r.desc}</div>
                    </div>
                    <div className={`h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${runtime === r.id ? 'border-brand bg-brand' : 'border-muted/40'}`}>
                      {runtime === r.id && <div className="h-2 w-2 rounded-full bg-white" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-line bg-panel2">
              <button onClick={() => setShowExtras((s) => !s)} className="flex w-full items-center justify-between px-4 py-3 text-xs font-semibold text-ink">
                <span>Extras opcionais</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-normal text-muted">{[withGit && 'git', withReadme && 'README', withEnv && '.env'].filter(Boolean).join(' · ') || 'nenhum'}</span>
                  <Icon name="chevronDown" className={`h-3.5 w-3.5 text-muted transition-transform ${showExtras ? 'rotate-180' : ''}`} />
                </div>
              </button>
              {showExtras && (
                <div className="border-t border-line p-3 grid grid-cols-3 gap-2">
                  {[
                    { key: 'git', label: 'git init', desc: 'Init + commit', val: withGit, set: setWithGit },
                    { key: 'readme', label: 'README.md', desc: 'Documentação', val: withReadme, set: setWithReadme },
                    { key: 'env', label: '.env', desc: 'Vars de ambiente', val: withEnv, set: setWithEnv },
                  ].map((opt) => (
                    <button key={opt.key} onClick={() => opt.set(!opt.val)}
                      className={['flex flex-col items-center gap-1.5 rounded-lg border py-2.5 px-2 text-center transition-colors', opt.val ? 'border-brand/40 bg-brand/10' : 'border-line hover:border-brand/20'].join(' ')}>
                      <div className={`flex h-5 w-5 items-center justify-center rounded border-2 ${opt.val ? 'border-brand bg-brand' : 'border-line/60'}`}>
                        {opt.val && <Icon name="check" className="h-3 w-3 text-white" />}
                      </div>
                      <span className="text-[11px] font-semibold text-ink">{opt.label}</span>
                      <span className="text-[10px] text-muted">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {err && <p className="rounded-xl border border-bad/20 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</p>}
          </div>

          {/* Direita — Prévia */}
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto bg-[#0d1117] p-5">
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Estrutura de arquivos</p>
              <div className="rounded-xl border border-white/8 bg-[#161b22] p-4 min-h-[140px]">
                <FileTree name={name} files={previewFiles} />
              </div>
            </div>
            {tpl.devCmd && (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Comando de dev</p>
                <div className="rounded-xl border border-white/8 bg-[#161b22] px-4 py-3 flex items-center gap-2">
                  <span className="text-zinc-600 text-[12px] select-none">$</span>
                  <code className="text-green-400 text-[12px] font-mono">{tpl.devCmd}</code>
                </div>
              </div>
            )}
            {tpl.port && (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Porta padrão</p>
                <div className="rounded-xl border border-white/8 bg-[#161b22] px-4 py-3 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-ok" />
                  <code className="text-sky-400 text-[12px] font-mono">:{tpl.port}</code>
                  <span className="text-zinc-500 text-[11px]">— localhost:{tpl.port}</span>
                </div>
              </div>
            )}
            <div className="flex-1" />
            <div className="rounded-xl border border-zinc-700/30 bg-zinc-800/20 p-3">
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                Após criar, o projeto aparece na lista ao lado e abre automaticamente no editor.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-line px-6 py-4 shrink-0 bg-panel">
          <div className="text-[11px] text-muted">
            {nameValid ? <span>Criar em <code className="text-brand font-mono">/var/www/{name}</code></span> : <span className="opacity-0">–</span>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-xl border border-line px-4 py-2 text-sm text-ink hover:bg-panel2">Cancelar</button>
            <button onClick={submit} disabled={!nameValid || loading}
              className="flex items-center gap-2 rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-40">
              {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Icon name="plus" className="h-4 w-4" />}
              Criar projeto
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const STUDIO_URL = 'https://studio.litedock.morenadoaco.com.br';

// ─── Forge principal ─────────────────────────────────────────────────────────
export function Forge() {
  const token = getToken() ?? '';
  const qc = useQueryClient();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [editorBust, setEditorBust] = useState(() => Date.now());
  const [projectSearch, setProjectSearch] = useState('');
  const [showNewProject, setShowNewProject] = useState(false);
  const [showDeploy, setShowDeploy] = useState(false);
  const [studioReady, setStudioReady] = useState(false);

  // Cria cookie de sessão no studio.litedock via API (Bearer JWT → cookie domain-wide)
  useEffect(() => {
    if (!token) return;
    api.post<{ ok: boolean }>('/studio/session')
      .then(() => setStudioReady(true))
      .catch(() => setStudioReady(false));
  }, [token]);

  const { data: projData, isLoading: projLoading } = useQuery({
    queryKey: ['devspace-projects'],
    queryFn: () => api.get<{ projects: Project[] }>('/devspace/projects'),
    staleTime: 30_000,
  });

  const reloadEditor = useCallback(() => setEditorBust(Date.now()), []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'F5') { e.preventDefault(); reloadEditor(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [reloadEditor]);

  const handleCreate = async (name: string, template: string, runtime: string, extras: CreateExtras) => {
    await api.post('/devspace/projects', { name, template, runtime, ...extras });
    toast.success(`Projeto "${name}" criado!`);
    await qc.invalidateQueries({ queryKey: ['devspace-projects'] });
  };

  const folderParam = activeProject ? `?folder=${encodeURIComponent(activeProject.path)}` : '';
  const editorSrc = studioReady ? `${STUDIO_URL}/${folderParam}` : null;

  const projects = (projData?.projects ?? []).filter((p) =>
    p.name.toLowerCase().includes(projectSearch.toLowerCase()),
  );

  return (
    <>
      {showNewProject && (
        <NewProjectModal onClose={() => setShowNewProject(false)} onCreate={handleCreate} />
      )}
      {showDeploy && activeProject && (
        <DeployModal project={activeProject} onClose={() => setShowDeploy(false)} />
      )}

      <div className="flex overflow-hidden" style={{ height: 'calc(100vh - 36px)' }}>

        {/* ── Esquerda: Projetos ──────────────────────────────────────── */}
        <aside className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-line bg-panel">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Icon name="folder" className="h-4 w-4 text-brand" />
            <span className="text-xs font-semibold text-ink">Projetos</span>
            <span className="ml-auto text-[10px] text-muted">/var/www</span>
            <button onClick={() => setShowNewProject(true)}
              className="ml-1 flex h-5 w-5 items-center justify-center rounded bg-brand text-white hover:bg-brand/80" title="Novo projeto">
              <Icon name="plus" className="h-3 w-3" />
            </button>
          </div>

          <div className="px-2 py-1.5">
            <input value={projectSearch} onChange={(e) => setProjectSearch(e.target.value)}
              placeholder="Filtrar projetos..."
              className="w-full rounded border border-line bg-panel2 px-2 py-1 text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-brand/40" />
          </div>

          <div className="flex-1 overflow-y-auto">
            {projLoading && (
              <div className="flex items-center justify-center py-8">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
              </div>
            )}
            {!projLoading && projects.length === 0 && (
              <div className="px-3 py-6 text-center">
                <p className="text-xs text-muted">Nenhum projeto encontrado</p>
                <button onClick={() => setShowNewProject(true)} className="mt-2 text-xs text-brand hover:underline">+ Criar primeiro projeto</button>
              </div>
            )}
            {projects.map((p) => (
              <button key={p.slug}
                onClick={() => { setActiveProject(p); reloadEditor(); }}
                className={['w-full border-b border-line/40 px-3 py-2.5 text-left transition-colors hover:bg-panel2', activeProject?.slug === p.slug ? 'bg-brand/10 ring-inset ring-1 ring-brand/25' : ''].join(' ')}>
                <div className="flex items-center gap-1.5">
                  <Icon name="folder" className="h-3.5 w-3.5 shrink-0 text-muted" />
                  <span className="truncate text-xs font-medium text-ink">{p.name}</span>
                  {p.git?.dirty && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-warn" title="Alterações não commitadas" />}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {p.stacks.map((s) => <StackBadge key={s} stack={s} />)}
                </div>
                {p.git && (
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-muted">
                    <Icon name="activity" className="h-3 w-3" />
                    <span className="truncate">{p.git.branch}</span>
                    {p.git.ahead > 0 && <span className="text-warn">↑{p.git.ahead}</span>}
                  </div>
                )}
                {p.git?.commit && <div className="mt-0.5 truncate text-[10px] text-muted/70">{p.git.commit}</div>}
              </button>
            ))}
          </div>

        </aside>

        {/* ── Centro: Editor + Terminal ───────────────────────────────── */}
        <div className="flex flex-1 flex-col overflow-hidden">

          {/* Barra do editor */}
          <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-panel px-3">
            <Icon name="terminal" className="h-4 w-4 text-brand" />
            <span className="truncate text-xs font-semibold text-ink">
              {activeProject ? activeProject.name : 'Forge — selecione um projeto'}
            </span>
            {activeProject && (
              <div className="flex gap-1">
                {activeProject.stacks.slice(0, 2).map((s) => <StackBadge key={s} stack={s} />)}
              </div>
            )}

            <div className="ml-auto flex items-center gap-1">
              {/* Publicar — só aparece quando tem projeto selecionado */}
              {activeProject && (
                <button onClick={() => setShowDeploy(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-brand/40 bg-brand/10 px-2.5 py-1 text-[11px] font-semibold text-brand hover:bg-brand/20 transition-colors">
                  <Icon name="rocket" className="h-3.5 w-3.5" />
                  Publicar
                </button>
              )}
              <button onClick={reloadEditor} className="rounded p-1 text-muted hover:bg-panel2 hover:text-ink" title="Recarregar editor (Shift+F5)">
                <Icon name="refresh" className="h-3.5 w-3.5" />
              </button>
              {studioReady && (
                <a href={`${STUDIO_URL}/${folderParam}`}
                  target="_blank" rel="noreferrer"
                  className="rounded p-1 text-muted hover:bg-panel2 hover:text-ink" title="Abrir em nova aba">
                  <Icon name="externalLink" className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </div>

          {/* Editor — ocupa todo o espaço vertical */}
          <div className="flex flex-1 overflow-hidden">
            {editorSrc ? (
              <iframe key={editorBust} ref={iframeRef} src={editorSrc}
                className="flex-1 border-0" allow="clipboard-read; clipboard-write; clipboard" title="Forge IDE" />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted">
                <Icon name="terminal" className="h-10 w-10 opacity-20" />
                <p className="text-sm">Iniciando ambiente de desenvolvimento...</p>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
