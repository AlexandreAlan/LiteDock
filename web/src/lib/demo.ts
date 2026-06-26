// ─────────────────────────────────────────────────────────────────────────
// MODO DEMONSTRAÇÃO do LiteDock
//
// Quando ativo, intercepta TODAS as chamadas de API (`request()` em api.ts) e
// devolve dados fictícios a partir de um store em memória. Nenhum backend é
// chamado, nenhum container/produção é tocado — é só pra demonstrar a UX.
//
// Ativação (qualquer uma):
//   • build com VITE_DEMO=1  (npm run build:demo)
//   • hostname começando com "demo."  (ex.: demo.litedock.morenadoaco.com.br)
//   • ?demo=1 na URL  (persistido em localStorage; ?demo=0 desativa)
// ─────────────────────────────────────────────────────────────────────────

import type {
  ContainerStat,
  Deployment,
  DockerEvent,
  DomainFull,
  EngineInfo,
  HostMetrics,
  Project,
  Service,
  ServiceFull,
  StorageItem,
  TemplateCatalog,
  User,
} from './api';

// ── Ativação ──────────────────────────────────────────────────────────────
function resolveDemo(): boolean {
  if (import.meta.env.VITE_DEMO === '1') return true;
  if (typeof window === 'undefined') return false;
  try {
    const qs = new URLSearchParams(location.search);
    if (qs.get('demo') === '0') {
      localStorage.removeItem('litedock_demo');
      return false;
    }
    if (qs.has('demo')) {
      localStorage.setItem('litedock_demo', '1');
      return true;
    }
    if (location.hostname.startsWith('demo.')) return true;
    return localStorage.getItem('litedock_demo') === '1';
  } catch {
    return false;
  }
}

export const DEMO = resolveDemo();

// ── Helpers ─────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10);
const nowISO = () => new Date().toISOString();
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const jitter = (base: number, spread: number, min = 0, max = 100) =>
  Math.min(max, Math.max(min, base + (Math.random() - 0.5) * spread));

const DEMO_USER: User = {
  id: 'demo-owner',
  email: 'demo@litedock.app',
  name: 'Visitante (Demo)',
  role: 'owner',
};

// ── Store mutável em memória ────────────────────────────────────────────────
interface DemoEnv {
  key: string;
  value: string;
  isSecret: boolean;
}
interface DemoDomain {
  id: string;
  host: string;
  targetPort: number;
  https: boolean;
  certStatus: string;
}
interface DemoDeployment {
  id: string;
  status: string;
  trigger: string;
  imageTag?: string | null;
  log?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  _start?: number; // ms — usado p/ simular deploy ao vivo
  _spec?: Record<string, unknown>;
}
interface DemoService {
  id: string;
  name: string;
  type: 'app' | 'database';
  status: string;
  containerId: string | null;
  projectId: string;
  spec: Record<string, unknown>;
  envVars: DemoEnv[];
  domains: DemoDomain[];
  deployments: DemoDeployment[];
  createdAt: string;
}
interface DemoProject {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

function mkService(p: Partial<DemoService> & { name: string; type: 'app' | 'database'; projectId: string }): DemoService {
  return {
    id: uid(),
    status: 'running',
    containerId: 'c' + uid(),
    spec: {},
    envVars: [],
    domains: [],
    deployments: [],
    createdAt: nowISO(),
    ...p,
  };
}

function seed(): { projects: DemoProject[]; services: DemoService[] } {
  const projects: DemoProject[] = [
    { id: 'p-loja', name: 'loja-online', slug: 'loja-online', createdAt: '2026-04-02T12:00:00Z' },
    { id: 'p-blog', name: 'blog-institucional', slug: 'blog-institucional', createdAt: '2026-03-18T09:30:00Z' },
    { id: 'p-auto', name: 'automacoes', slug: 'automacoes', createdAt: '2026-05-11T15:45:00Z' },
  ];

  const services: DemoService[] = [
    mkService({
      name: 'storefront', type: 'app', projectId: 'p-loja',
      spec: { source: 'git', repo: 'https://github.com/loja/storefront.git', branch: 'main', port: 3000 },
      envVars: [
        { key: 'NODE_ENV', value: 'production', isSecret: false },
        { key: 'API_URL', value: 'https://api.minhaloja.com.br', isSecret: false },
        { key: 'STRIPE_KEY', value: '••••••••••••', isSecret: true },
      ],
      domains: [{ id: uid(), host: 'minhaloja.com.br', targetPort: 3000, https: true, certStatus: 'active' }],
    }),
    mkService({
      name: 'api', type: 'app', projectId: 'p-loja',
      spec: { source: 'git', repo: 'https://github.com/loja/api.git', branch: 'main', port: 4000 },
      envVars: [
        { key: 'DATABASE_URL', value: 'postgres://loja:••••@postgres:5432/loja', isSecret: true },
        { key: 'REDIS_URL', value: 'redis://redis:6379', isSecret: false },
      ],
      domains: [{ id: uid(), host: 'api.minhaloja.com.br', targetPort: 4000, https: true, certStatus: 'active' }],
    }),
    mkService({ name: 'postgres', type: 'database', projectId: 'p-loja', spec: { engine: 'postgres:16' } }),
    mkService({ name: 'redis', type: 'database', projectId: 'p-loja', spec: { engine: 'redis:7' } }),

    mkService({
      name: 'wordpress', type: 'app', projectId: 'p-blog',
      spec: { source: 'image', image: 'wordpress:6.5', port: 80 },
      domains: [{ id: uid(), host: 'blog.morenadoaco.com.br', targetPort: 80, https: true, certStatus: 'active' }],
    }),
    mkService({ name: 'mysql', type: 'database', projectId: 'p-blog', spec: { engine: 'mysql:8' } }),

    mkService({
      name: 'n8n', type: 'app', projectId: 'p-auto',
      spec: { source: 'image', image: 'n8nio/n8n:latest', port: 5678 },
      domains: [{ id: uid(), host: 'n8n.morenadoaco.com.br', targetPort: 5678, https: true, certStatus: 'active' }],
    }),
    mkService({
      name: 'evolution-api', type: 'app', projectId: 'p-auto', status: 'stopped', containerId: null,
      spec: { source: 'image', image: 'atendai/evolution-api:latest', port: 8080 },
    }),
  ];

  // histórico de deploys de exemplo
  for (const s of services) {
    if (s.type !== 'app') continue;
    s.deployments = [
      { id: uid(), status: 'success', trigger: 'manual', imageTag: 'sha-3f9a1c', startedAt: '2026-06-20T14:02:00Z', finishedAt: '2026-06-20T14:03:10Z' },
      { id: uid(), status: 'success', trigger: 'webhook', imageTag: 'sha-7b21e0', startedAt: '2026-06-18T10:21:00Z', finishedAt: '2026-06-18T10:22:30Z' },
    ];
  }
  return { projects, services };
}

const store = seed();

// containers de sistema (não-gerenciados) pra dar realismo ao Monitor
const SYSTEM_CONTAINERS = ['litedock-traefik', 'litedock-postgres', 'watchtower'];
const runningState = new Map<string, boolean>();
const schedules = new Map<string, { startTime: string | null; stopTime: string | null; enabled: boolean }>();

// ── Catálogo de templates ───────────────────────────────────────────────────
const TEMPLATES: TemplateCatalog = {
  categories: ['CMS', 'Banco de Dados', 'Automação', 'Analytics', 'Ferramentas'],
  templates: [
    { slug: 'wordpress', name: 'WordPress', description: 'O CMS mais usado do mundo para sites e blogs.', category: 'CMS', logo: '📝', serviceCount: 2, images: ['wordpress:6.5', 'mysql:8'] },
    { slug: 'ghost', name: 'Ghost', description: 'Plataforma moderna de publicação e newsletters.', category: 'CMS', logo: '👻', serviceCount: 1, images: ['ghost:5'] },
    { slug: 'postgres', name: 'PostgreSQL', description: 'Banco relacional robusto e open-source.', category: 'Banco de Dados', logo: '🐘', serviceCount: 1, images: ['postgres:16'] },
    { slug: 'mysql', name: 'MySQL', description: 'Banco relacional clássico e confiável.', category: 'Banco de Dados', logo: '🐬', serviceCount: 1, images: ['mysql:8'] },
    { slug: 'mongodb', name: 'MongoDB', description: 'Banco de documentos NoSQL flexível.', category: 'Banco de Dados', logo: '🍃', serviceCount: 1, images: ['mongo:7'] },
    { slug: 'redis', name: 'Redis', description: 'Cache e fila em memória, ultrarrápido.', category: 'Banco de Dados', logo: '⚡', serviceCount: 1, images: ['redis:7'] },
    { slug: 'n8n', name: 'n8n', description: 'Automação de fluxos sem código (alternativa ao Zapier).', category: 'Automação', logo: '🔗', serviceCount: 1, images: ['n8nio/n8n'] },
    { slug: 'uptime-kuma', name: 'Uptime Kuma', description: 'Monitoramento de uptime self-hosted, lindo e simples.', category: 'Ferramentas', logo: '📊', serviceCount: 1, images: ['louislam/uptime-kuma'] },
    { slug: 'metabase', name: 'Metabase', description: 'BI e dashboards sobre seus bancos de dados.', category: 'Analytics', logo: '📈', serviceCount: 2, images: ['metabase/metabase', 'postgres:16'] },
    { slug: 'plausible', name: 'Plausible', description: 'Analytics web leve e respeitando privacidade.', category: 'Analytics', logo: '🔒', serviceCount: 3, images: ['plausible/analytics'] },
    { slug: 'nextcloud', name: 'Nextcloud', description: 'Sua nuvem de arquivos privada (alternativa ao Drive).', category: 'Ferramentas', logo: '☁️', serviceCount: 2, images: ['nextcloud:apache'] },
    { slug: 'minio', name: 'MinIO', description: 'Armazenamento de objetos compatível com S3.', category: 'Ferramentas', logo: '🪣', serviceCount: 1, images: ['minio/minio'] },
  ],
};

// ── Simulação de deploy ao vivo ─────────────────────────────────────────────
// O log/status evoluem conforme o tempo desde o início, pra UI mostrar
// progresso real durante o polling.
const DEPLOY_STEPS = [
  { t: 0, line: '╭─ LiteDock · iniciando implantação' },
  { t: 400, line: '→ resolvendo origem (Git/imagem)…' },
  { t: 1200, line: '→ docker build · detectando stack via Nixpacks' },
  { t: 2400, line: '   #1 [build 1/5] preparando contexto' },
  { t: 3400, line: '   #2 [build 2/5] instalando dependências' },
  { t: 5200, line: '   #3 [build 4/5] compilando aplicação' },
  { t: 6400, line: '→ subindo nova versão (blue-green)…' },
  { t: 7400, line: '→ healthcheck OK · roteando tráfego no Traefik' },
  { t: 8200, line: '→ removendo versão antiga' },
  { t: 8600, line: '✓ implantação concluída — app no ar' },
];

function renderDeploy(d: DemoDeployment): Deployment {
  if (d._start == null) {
    return { id: d.id, status: d.status, trigger: d.trigger, imageTag: d.imageTag, log: d.log, startedAt: d.startedAt, finishedAt: d.finishedAt };
  }
  const elapsed = Date.now() - d._start;
  const shown = DEPLOY_STEPS.filter((s) => elapsed >= s.t);
  const log = shown.map((s) => s.line).join('\n');
  const done = elapsed >= DEPLOY_STEPS[DEPLOY_STEPS.length - 1].t;
  let status = 'building';
  if (elapsed >= 6400) status = 'deploying';
  if (done) status = 'success';
  // ao concluir, fixa o estado e marca o serviço como running
  if (done && d.status !== 'success') {
    d.status = 'success';
    d.finishedAt = nowISO();
    d.log = log;
    const svc = store.services.find((s) => s.deployments.includes(d));
    if (svc) { svc.status = 'running'; svc.containerId = 'c' + uid(); }
  }
  return { id: d.id, status, trigger: d.trigger, imageTag: d.imageTag ?? 'sha-' + uid().slice(0, 6), log, startedAt: d.startedAt, finishedAt: done ? d.finishedAt : null };
}

// ── Métricas / monitor ──────────────────────────────────────────────────────
function hostMetrics(): HostMetrics {
  const cpu = jitter(34, 18);
  const mem = jitter(58, 8);
  const disk = 41.3;
  return {
    hostname: 'litedock-demo',
    publicIp: '177.7.54.198',
    uptimeSec: 1_209_600,
    cpu: { pct: cpu, cores: 4, load: [jitter(0.8, 0.6, 0, 4), jitter(0.7, 0.5, 0, 4), jitter(0.6, 0.4, 0, 4)] },
    memory: { usedBytes: (mem / 100) * 8 * 1024 ** 3, totalBytes: 8 * 1024 ** 3, pct: mem },
    disk: { usedBytes: (disk / 100) * 80 * 1024 ** 3, totalBytes: 80 * 1024 ** 3, pct: disk },
    network: { inBps: jitter(420_000, 600_000, 0, 5_000_000), outBps: jitter(310_000, 500_000, 0, 5_000_000) },
  };
}

function containerStats(): ContainerStat[] {
  const managed: ContainerStat[] = store.services
    .filter((s) => s.containerId)
    .map((s) => {
      const proj = store.projects.find((p) => p.id === s.projectId);
      const cname = `litedock-${proj?.slug}-${s.name}`;
      const running = runningState.get(cname) ?? s.status !== 'stopped';
      return {
        id: s.containerId!, name: cname, project: proj?.name ?? null, managed: true,
        serviceId: s.id,
        state: running ? 'running' : 'exited', running,
        cpuPct: running ? jitter(s.type === 'database' ? 1.2 : 6, 5, 0, 100) : 0,
        memBytes: running ? jitter(s.type === 'database' ? 140 : 80, 40, 30, 512) * 1024 ** 2 : 0,
        netInBps: running ? jitter(40_000, 60_000, 0, 2_000_000) : 0,
        netOutBps: running ? jitter(28_000, 50_000, 0, 2_000_000) : 0,
        schedule: schedules.get(cname) ?? null,
      };
    });
  const system: ContainerStat[] = SYSTEM_CONTAINERS.map((name) => {
    const running = runningState.get(name) ?? true;
    return {
      id: 'sys-' + name, name, project: null, managed: false,
      serviceId: null,
      state: running ? 'running' : 'exited', running,
      cpuPct: running ? jitter(0.6, 0.8, 0, 100) : 0,
      memBytes: running ? jitter(60, 20, 20, 256) * 1024 ** 2 : 0,
      netInBps: running ? jitter(10_000, 18_000, 0, 1_000_000) : 0,
      netOutBps: running ? jitter(8_000, 14_000, 0, 1_000_000) : 0,
      schedule: schedules.get(name) ?? null,
    };
  });
  return [...managed, ...system];
}

function dockerEvents(): DockerEvent[] {
  const actions = ['start', 'health_status: healthy', 'exec_create', 'exec_start', 'die', 'create', 'pull'];
  const names = store.services.map((s) => `litedock-${store.projects.find((p) => p.id === s.projectId)?.slug}-${s.name}`);
  const out: DockerEvent[] = [];
  let t = Date.now();
  for (let i = 0; i < 24; i++) {
    t -= Math.floor(Math.random() * 90_000);
    out.push({ type: 'container', action: actions[Math.floor(Math.random() * actions.length)], time: t, name: names[Math.floor(Math.random() * names.length)] });
  }
  return out;
}

function storage(): StorageItem[] {
  const vols: StorageItem[] = store.services
    .filter((s) => s.type === 'database')
    .map((s) => ({ name: `litedock-${s.name}-data`, kind: 'volume' as const, sizeBytes: jitter(800, 400, 100, 4000) * 1024 ** 2, path: `/var/lib/docker/volumes/litedock-${s.name}-data` }));
  const conts: StorageItem[] = store.services
    .filter((s) => s.containerId)
    .slice(0, 4)
    .map((s) => ({ name: s.name, kind: 'container' as const, sizeBytes: jitter(220, 120, 40, 900) * 1024 ** 2, path: `/var/lib/docker/overlay2/${uid()}` }));
  return [...vols, ...conts].sort((a, b) => b.sizeBytes - a.sizeBytes);
}

function engineInfo(): EngineInfo {
  const total = store.services.length + SYSTEM_CONTAINERS.length;
  const running = store.services.filter((s) => s.containerId).length + SYSTEM_CONTAINERS.length;
  return {
    containers: total, containersRunning: running, containersStopped: total - running,
    images: 18, serverVersion: '27.1.1', ncpu: 4, memTotal: 8 * 1024 ** 3, name: 'litedock-demo',
  };
}

// ── Views (formato exato que as páginas esperam) ────────────────────────────
function projectView(p: DemoProject): Project {
  const services = store.services.filter((s) => s.projectId === p.id).map(serviceLite);
  return { id: p.id, name: p.name, slug: p.slug, createdAt: p.createdAt, services };
}
function serviceLite(s: DemoService): Service {
  return { id: s.id, name: s.name, type: s.type, status: s.status, containerId: s.containerId, spec: s.spec, projectId: s.projectId, createdAt: s.createdAt };
}
function serviceFull(s: DemoService): ServiceFull {
  const proj = store.projects.find((p) => p.id === s.projectId);
  return {
    ...serviceLite(s),
    project: proj ? { id: proj.id, name: proj.name } : undefined,
    envVars: s.envVars,
    domains: s.domains,
    deployments: [...s.deployments].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()),
  };
}
function allDomains(): DomainFull[] {
  const out: DomainFull[] = [];
  for (const s of store.services) {
    const proj = store.projects.find((p) => p.id === s.projectId);
    for (const d of s.domains) {
      out.push({ id: d.id, host: d.host, targetPort: d.targetPort, https: d.https, certStatus: d.certStatus, service: { id: s.id, name: s.name, project: proj ? { id: proj.id, name: proj.name } : undefined } });
    }
  }
  return out;
}

// ── Roteador ────────────────────────────────────────────────────────────────
function findService(id: string) {
  return store.services.find((s) => s.id === id);
}

// Configs gerais do painel no modo demo (vivem em memória durante a sessão).
const demoSettings: Record<string, string> = {
  panelCustomDomain: 'demo.litedock.app',
  panelServeOnIp: 'false',
  serviceCustomDomain: '',
  letsEncryptEmail: 'admin@litedock.app',
  dailyDockerCleanup: 'true',
};

// Estado da conexão GitHub no modo demo (memória da sessão).
const demoGithub = { connected: false };

function route(method: string, path: string, body: any): unknown {
  const [rawPath] = path.split('?');
  const parts = rawPath.split('/').filter(Boolean); // ex.: ['services','abc','deploy']
  const M = method.toUpperCase();

  // auth
  if (rawPath === '/auth/login' || rawPath === '/auth/register') return { token: 'demo-token', user: DEMO_USER };
  if (rawPath === '/auth/me') return { user: DEMO_USER };
  if (rawPath === '/auth/credentials' && M === 'PATCH')
    return { token: 'demo-token', user: { ...DEMO_USER, email: (body?.email as string) || DEMO_USER.email } };

  // settings (configs gerais do painel)
  if (rawPath === '/settings' && M === 'GET') return { ...demoSettings };
  if (rawPath === '/settings' && M === 'PATCH') {
    for (const [k, v] of Object.entries(body || {})) if (v !== undefined) demoSettings[k] = String(v);
    return { ...demoSettings };
  }

  // projects
  if (rawPath === '/projects' && M === 'GET') return store.projects.map(projectView);
  if (rawPath === '/projects' && M === 'POST') {
    const name = (body?.name as string) || 'novo-projeto';
    const p: DemoProject = { id: uid(), name, slug: name.toLowerCase().replace(/\s+/g, '-'), createdAt: nowISO() };
    store.projects.push(p);
    return projectView(p);
  }
  if (parts[0] === 'projects' && parts[1] && parts.length === 2 && M === 'GET') {
    const p = store.projects.find((x) => x.id === parts[1]);
    if (!p) throw new DemoError(404, 'Projeto não encontrado');
    return projectView(p);
  }
  if (parts[0] === 'projects' && parts[1] && parts.length === 2 && M === 'PATCH') {
    const p = store.projects.find((x) => x.id === parts[1]);
    if (!p) throw new DemoError(404, 'Projeto não encontrado');
    if (body?.name) p.name = body.name as string;
    return projectView(p);
  }
  if (parts[0] === 'projects' && parts[1] && parts.length === 2 && M === 'DELETE') {
    store.projects = store.projects.filter((x) => x.id !== parts[1]);
    store.services = store.services.filter((x) => x.projectId !== parts[1]);
    return { ok: true };
  }
  // pontes de rede (demo): isolado por padrão, sem pontes
  if (parts[0] === 'projects' && parts[1] && parts[2] === 'bridges') {
    if (M === 'GET') return { connected: [], available: store.projects.filter((x) => x.id !== parts[1]).map((x) => ({ id: x.id, name: x.name, slug: x.slug })) };
    return { ok: true };
  }
  if (parts[0] === 'projects' && parts[2] === 'services' && M === 'POST') {
    const svc = mkService({ name: body?.name || 'servico', type: body?.type || 'app', projectId: parts[1], status: 'created', containerId: null, spec: body?.spec || {} });
    store.services.push(svc);
    return serviceLite(svc);
  }

  // templates
  if (rawPath === '/templates' && M === 'GET') return TEMPLATES;
  if (parts[0] === 'templates' && parts[2] === 'install' && M === 'POST') {
    const tpl = TEMPLATES.templates.find((t) => t.slug === parts[1]);
    const projectId = body?.projectId as string;
    if (tpl && projectId) {
      const svc = mkService({ name: tpl.slug, type: tpl.slug.match(/postgres|mysql|mongo|redis/) ? 'database' : 'app', projectId, spec: { source: 'image', image: tpl.images[0], port: 80 } });
      store.services.push(svc);
    }
    return { ok: true };
  }

  // domains
  if (rawPath === '/domains' && M === 'GET') return allDomains();

  // sistema (worker Python) — no demo é tudo simulado
  if (rawPath === '/servers/local/system/worker') return { online: true, ok: true, safeMode: true };
  if (rawPath === '/servers/local/system/df') return { images: { count: 12, size: 0, sizeHuman: '3.4 GB', reclaimable: 0, reclaimableHuman: '820.0 MB' }, containers: { count: 6 }, volumes: { count: 4, size: 0, sizeHuman: '1.1 GB' } };
  if (rawPath === '/servers/local/system/prune' && M === 'POST') return { status: 'ok', imagesDeleted: 3, containersRemoved: 1, spaceReclaimed: 0, spaceReclaimedHuman: '820.0 MB' };
  if (rawPath === '/servers/local/system/traefik/restart' && M === 'POST') return { status: 'restarted', container: 'litedock-traefik' };
  if (rawPath === '/servers/local/system/traefik/logs') return { logs: 'demo: logs do Traefik indisponíveis no modo demonstração.' };
  if (rawPath === '/servers/local/system/panel/restart' && M === 'POST') return { status: 'restarting', process: 'litedock-v2-api' };

  // usuários (demo)
  if (rawPath === '/users' && M === 'GET') return [{ ...DEMO_USER, createdAt: nowISO() }];
  if (rawPath === '/users' && M === 'POST') return { id: uid(), email: body?.email, name: body?.name, role: body?.role || 'member', createdAt: nowISO() };
  if (parts[0] === 'users' && parts[1] && M === 'PATCH') return { ...DEMO_USER, role: body?.role || DEMO_USER.role };
  if (parts[0] === 'users' && parts[1] && M === 'DELETE') return { ok: true };

  // 2FA (demo): fluxo simulado
  if (rawPath === '/auth/2fa/setup' && M === 'POST') return { secret: 'JBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/LiteDock:demo?secret=JBSWY3DPEHPK3PXP&issuer=LiteDock' };
  if (rawPath === '/auth/2fa/enable' && M === 'POST') return { ok: true, totpEnabled: true };
  if (rawPath === '/auth/2fa/disable' && M === 'POST') return { ok: true, totpEnabled: false };

  // github (demo)
  if (rawPath === '/github/status') return demoGithub.connected
    ? { connected: true, credentialId: 'demo-cred', login: 'demo-user', name: 'Demo User', avatarUrl: 'https://avatars.githubusercontent.com/u/9919?s=80', htmlUrl: 'https://github.com/demo-user' }
    : { connected: false };
  if (rawPath === '/github/connect' && M === 'POST') { demoGithub.connected = true; return { connected: true, login: 'demo-user', name: 'Demo User', avatarUrl: 'https://avatars.githubusercontent.com/u/9919?s=80', htmlUrl: 'https://github.com/demo-user' }; }
  if (rawPath === '/github/disconnect' && M === 'DELETE') { demoGithub.connected = false; return { connected: false }; }
  if (rawPath === '/github/repos') return [
    { fullName: 'demo-user/loja-online', private: false, defaultBranch: 'main', cloneUrl: 'https://github.com/demo-user/loja-online.git', credentialId: 'demo-cred', updatedAt: nowISO() },
    { fullName: 'demo-user/api-privada', private: true, defaultBranch: 'main', cloneUrl: 'https://github.com/demo-user/api-privada.git', credentialId: 'demo-cred', updatedAt: nowISO() },
  ];

  // servers / monitor
  if (rawPath === '/servers/local/version') return { version: '0.6.0' };
  if (rawPath === '/servers/local/metrics') return hostMetrics();
  if (rawPath === '/servers/local/engine') return engineInfo();
  if (rawPath === '/servers/local/container-stats') return containerStats();
  if (rawPath === '/servers/local/docker-events') return dockerEvents();
  if (rawPath === '/servers/local/storage') return storage();
  if (parts[0] === 'servers' && parts[2] === 'containers' && parts[4] && (parts[4] === 'start' || parts[4] === 'stop')) {
    runningState.set(decodeURIComponent(parts[3]), parts[4] === 'start');
    return { ok: true };
  }
  if (parts[0] === 'servers' && parts[2] === 'containers' && parts[4] === 'schedule') {
    const name = decodeURIComponent(parts[3]);
    if (M === 'GET') return schedules.get(name) ?? { containerName: name, startTime: null, stopTime: null, enabled: false };
    if (M === 'PUT') { schedules.set(name, { startTime: body?.startTime ?? null, stopTime: body?.stopTime ?? null, enabled: !!body?.enabled }); return { ok: true }; }
    if (M === 'DELETE') { schedules.delete(name); return { ok: true }; }
  }

  // services
  if (parts[0] === 'services' && parts[1]) {
    const s = findService(parts[1]);
    if (!s) throw new DemoError(404, 'Serviço não encontrado');

    if (parts.length === 2 && M === 'GET') return serviceFull(s);
    if (parts.length === 2 && M === 'PATCH') {
      if (body?.name) s.name = body.name as string;
      if (body?.spec) s.spec = { ...s.spec, ...body.spec };
      return serviceLite(s);
    }
    if (parts.length === 2 && M === 'DELETE') { store.services = store.services.filter((x) => x.id !== s.id); return { ok: true }; }

    // Histórico de métricas fictício (série ondulada) p/ a aba Métricas da demo.
    if (parts[2] === 'metrics-history' && M === 'GET') {
      const n = 60, now = Date.now();
      const samples = Array.from({ length: n }, (_, i) => {
        const t = now - (n - 1 - i) * 20000;
        const w = Math.sin(i / 6) * 0.5 + 0.5;
        return {
          t,
          cpuPct: +(8 + w * 34 + Math.random() * 6).toFixed(2),
          memBytes: Math.round((120 + w * 80 + Math.random() * 20) * 1024 * 1024),
          netInBps: Math.round((40 + w * 180 + Math.random() * 30) * 1024),
          netOutBps: Math.round((20 + w * 90 + Math.random() * 20) * 1024),
        };
      });
      return { samples };
    }

    if (parts[2] === 'deploy' && M === 'POST') {
      const d: DemoDeployment = { id: uid(), status: 'building', trigger: 'manual', startedAt: nowISO(), _start: Date.now() };
      s.deployments.push(d);
      s.status = 'deploying';
      return { deploymentId: d.id, status: 'building' };
    }
    if (parts[2] === 'deployments' && parts[3] && M === 'GET') {
      const d = s.deployments.find((x) => x.id === parts[3]);
      if (!d) throw new DemoError(404, 'Deploy não encontrado');
      return renderDeploy(d);
    }
    if ((parts[2] === 'start' || parts[2] === 'restart') && M === 'POST') { s.status = 'running'; s.containerId = s.containerId || 'c' + uid(); return { ok: true }; }
    if (parts[2] === 'stop' && M === 'POST') { s.status = 'stopped'; return { ok: true }; }

    if (parts[2] === 'env' && M === 'POST') { s.envVars.push({ key: body.key, value: body.isSecret ? '••••••••' : body.value, isSecret: !!body.isSecret }); return { ok: true }; }
    if (parts[2] === 'env' && parts[3] && M === 'DELETE') { const k = decodeURIComponent(parts[3]); s.envVars = s.envVars.filter((e) => e.key !== k); return { ok: true }; }

    if (parts[2] === 'domains' && M === 'POST') { s.domains.push({ id: uid(), host: body.host, targetPort: body.targetPort || 80, https: body.https !== false, certStatus: 'pending' }); return { ok: true }; }
    if (parts[2] === 'domains' && parts[3] && M === 'DELETE') { s.domains = s.domains.filter((d) => d.id !== parts[3]); return { ok: true }; }

    if (parts[2] === 'logs' && M === 'GET') return { logs: demoLogs(s) };
    if (parts[2] === 'webhook' && M === 'POST') return { url: `https://demo.litedock.app/webhooks/services/${s.id}/deploy?token=${uid()}${uid()}` };
  }

  throw new DemoError(404, `Demo: rota não mapeada — ${M} ${rawPath}`);
}

function demoLogs(s: DemoService): string {
  const ts = () => new Date(Date.now() - Math.floor(Math.random() * 60000)).toISOString();
  const lines = s.type === 'database'
    ? [
        `${ts()} LOG:  database system is ready to accept connections`,
        `${ts()} LOG:  checkpoint starting: time`,
        `${ts()} LOG:  checkpoint complete: wrote 42 buffers`,
        `${ts()} LOG:  connection received: host=10.0.0.4`,
      ]
    : [
        `${ts()} ➜  Server listening on http://0.0.0.0:${s.spec.port || 3000}`,
        `${ts()} [info] ready in 318ms`,
        `${ts()} GET / 200 — 12ms`,
        `${ts()} GET /api/health 200 — 3ms`,
        `${ts()} POST /api/checkout 201 — 84ms`,
      ];
  return lines.join('\n');
}

// ── Erro no formato que api.ts entende (status + message) ────────────────────
export class DemoError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Latência fake leve pra parecer rede de verdade (spinners aparecem).
export async function demoRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  await sleep(120 + Math.random() * 220);
  return route(method, path, body) as T;
}
