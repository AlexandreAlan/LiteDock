// Telemetria detalhada do Docker para o Monitor (estilo EasyPanel):
//  • stats por container (CPU% / memória / rede ↓↑)
//  • stream de eventos do Docker (buffer em memória)
//  • uso de armazenamento (containers + volumes via `docker system df`)
import { docker } from './docker.js';
import { prisma } from '../db.js';
import { workerPost } from './worker.js';

// ── Stats por container ──────────────────────────────────────────────────
type NetSnap = { rx: number; tx: number; t: number };
const lastNet = new Map<string, NetSnap>(); // delta de rede por container → Bps

function cpuPct(s: any): number {
  const cpuDelta = s.cpu_stats.cpu_usage.total_usage - s.precpu_stats.cpu_usage.total_usage;
  const sysDelta = s.cpu_stats.system_cpu_usage - s.precpu_stats.system_cpu_usage;
  const cpus = s.cpu_stats.online_cpus || s.cpu_stats.cpu_usage.percpu_usage?.length || 1;
  return sysDelta > 0 && cpuDelta > 0 ? +((cpuDelta / sysDelta) * cpus * 100).toFixed(2) : 0;
}
function sumNet(s: any): { rx: number; tx: number } {
  let rx = 0, tx = 0;
  for (const n of Object.values(s.networks ?? {}) as any[]) { rx += n.rx_bytes || 0; tx += n.tx_bytes || 0; }
  return { rx, tx };
}

export interface ScheduleInfo { startTime: string | null; stopTime: string | null; enabled: boolean }
export interface ContainerStat {
  id: string; name: string; project: string | null; managed: boolean;
  state: string; running: boolean;
  cpuPct: number; memBytes: number; netInBps: number; netOutBps: number;
  schedule: ScheduleInfo | null;
}

export async function containerStats(): Promise<ContainerStat[]> {
  const [list, schedules] = await Promise.all([
    docker.listContainers({ all: true }), // todos (inclui parados)
    prisma.containerSchedule.findMany(),
  ]);
  const sched = new Map(schedules.map((s) => [s.containerName, s]));
  const now = Date.now();
  const rows = await Promise.all(
    list.map(async (c) => {
      const name = (c.Names?.[0] || '').replace(/^\//, '');
      const running = c.State === 'running';
      const s0 = sched.get(name);
      const base = {
        id: c.Id.slice(0, 12),
        name,
        project: (c.Labels?.['litedock.project'] as string) || null,
        managed: c.Labels?.['litedock.managed'] === 'true',
        state: c.State,
        running,
        schedule: s0 ? { startTime: s0.startTime, stopTime: s0.stopTime, enabled: s0.enabled } : null,
      };
      if (!running) return { ...base, cpuPct: 0, memBytes: 0, netInBps: 0, netOutBps: 0 };
      try {
        const s: any = await new Promise((res, rej) =>
          docker.getContainer(c.Id).stats({ stream: false }, (e: unknown, d: unknown) => (e ? rej(e) : res(d))),
        );
        const mem = (s.memory_stats?.usage || 0) - (s.memory_stats?.stats?.cache || 0);
        const net = sumNet(s);
        const prev = lastNet.get(c.Id);
        let inBps = 0, outBps = 0;
        if (prev) {
          const dt = (now - prev.t) / 1000;
          if (dt > 0) { inBps = Math.max(0, (net.rx - prev.rx) / dt); outBps = Math.max(0, (net.tx - prev.tx) / dt); }
        }
        lastNet.set(c.Id, { rx: net.rx, tx: net.tx, t: now });
        return { ...base, cpuPct: cpuPct(s), memBytes: Math.max(0, mem), netInBps: Math.round(inBps), netOutBps: Math.round(outBps) };
      } catch {
        return { ...base, cpuPct: 0, memBytes: 0, netInBps: 0, netOutBps: 0 };
      }
    }),
  );
  // em execução primeiro, depois por memória
  return rows.sort((a, b) => Number(b.running) - Number(a.running) || b.memBytes - a.memBytes);
}

// ── Histórico de métricas por serviço (séries temporais em memória) ──────────
// Amostra só containers GERENCIADOS (poucos) a cada 20s e guarda uma janela
// rolante. Em memória de propósito: gráfico de monitoramento, não auditoria —
// reconstrói sozinho após restart, sem custo de banco.
export interface MetricSample { t: number; cpuPct: number; memBytes: number; netInBps: number; netOutBps: number }
const HISTORY_CAP = 180; // ~1h a cada 20s
const history = new Map<string, MetricSample[]>();
const lastNetHist = new Map<string, NetSnap>();

export function getMetricsHistory(name: string): MetricSample[] {
  return history.get(name) ?? [];
}

async function collectMetrics() {
  const list = await docker.listContainers(); // só em execução
  const now = Date.now();
  for (const c of list) {
    if (c.Labels?.['litedock.managed'] !== 'true') continue; // só serviços do LiteDock
    const name = (c.Names?.[0] || '').replace(/^\//, '');
    try {
      const s: any = await new Promise((res, rej) =>
        docker.getContainer(c.Id).stats({ stream: false }, (e: unknown, d: unknown) => (e ? rej(e) : res(d))),
      );
      const mem = (s.memory_stats?.usage || 0) - (s.memory_stats?.stats?.cache || 0);
      const net = sumNet(s);
      const prev = lastNetHist.get(c.Id);
      let inBps = 0, outBps = 0;
      if (prev) {
        const dt = (now - prev.t) / 1000;
        if (dt > 0) { inBps = Math.max(0, (net.rx - prev.rx) / dt); outBps = Math.max(0, (net.tx - prev.tx) / dt); }
      }
      lastNetHist.set(c.Id, { rx: net.rx, tx: net.tx, t: now });
      const buf = history.get(name) ?? [];
      buf.push({ t: now, cpuPct: cpuPct(s), memBytes: Math.max(0, mem), netInBps: Math.round(inBps), netOutBps: Math.round(outBps) });
      while (buf.length > HISTORY_CAP) buf.shift();
      history.set(name, buf);
    } catch { /* container sumiu/sem stats — ignora o ciclo */ }
  }
}

let collectorStarted = false;
export function startMetricsCollector() {
  if (collectorStarted) return;
  collectorStarted = true;
  collectMetrics().catch(() => {});
  setInterval(() => collectMetrics().catch(() => {}), 20_000);
}

// Só containers GERENCIADOS pelo LiteDock (label litedock.managed=true) podem ser
// controlados pelo painel — protege os serviços de produção que dividem o mesmo host
// (trackjus, altivaai, etc.) de serem parados/agendados por engano.
export async function isManaged(name: string): Promise<boolean> {
  try {
    const info = await docker.getContainer(name).inspect();
    return info?.Config?.Labels?.['litedock.managed'] === 'true';
  } catch {
    return false;
  }
}
async function assertManaged(name: string) {
  if (!(await isManaged(name)))
    throw new Error(
      `Ação bloqueada: "${name}" não é um container gerenciado pelo LiteDock — o painel só controla os próprios serviços, nunca os de produção do host.`,
    );
}

// Liga/desliga um container do host pelo nome (somente gerenciados).
export async function startContainer(name: string) { await assertManaged(name); await docker.getContainer(name).start(); }
export async function stopContainer(name: string) { await assertManaged(name); await docker.getContainer(name).stop(); }

// ── Agendador (liga/desliga diário por horário local) ────────────────────
let schedStarted = false;
let lastCleanupDay = '';
export function startScheduler() {
  if (schedStarted) return;
  schedStarted = true;
  const tick = async () => {
    try {
      const d = new Date();
      const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      const all = await prisma.containerSchedule.findMany({ where: { enabled: true } });
      for (const s of all) {
        if (s.startTime === hhmm) await startContainer(s.containerName).catch(() => {});
        if (s.stopTime === hhmm) await stopContainer(s.containerName).catch(() => {});
      }
      // Limpeza diária do Docker às 04:00, se ligada nos ajustes. Segura:
      // o worker só remove imagens dangling e containers parados do LiteDock.
      const today = d.toISOString().slice(0, 10);
      if (hhmm === '04:00' && lastCleanupDay !== today) {
        lastCleanupDay = today;
        const flag = await prisma.setting.findUnique({ where: { key: 'dailyDockerCleanup' } });
        if (flag?.value === 'true') await workerPost('/system/prune').catch(() => {});
      }
    } catch { /* ignora ciclo */ }
  };
  setInterval(tick, 60_000);
}

// ── Eventos do Docker (buffer em memória) ────────────────────────────────
export interface DockerEvent { type: string; action: string; time: number; name?: string }
const events: DockerEvent[] = [];
let started = false;

export function startDockerEvents() {
  if (started) return;
  started = true;
  docker.getEvents((err: unknown, stream: NodeJS.ReadableStream | undefined) => {
    if (err || !stream) { started = false; return; }
    stream.on('data', (buf: Buffer) => {
      for (const line of buf.toString('utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const e = JSON.parse(line);
          events.unshift({
            type: e.Type ?? '—',
            action: e.Action ?? e.status ?? '—',
            time: (e.time || 0) * 1000,
            name: e.Actor?.Attributes?.name,
          });
          if (events.length > 200) events.pop();
        } catch { /* linha parcial */ }
      }
    });
    stream.on('error', () => { started = false; });
  });
}

export function dockerEvents(limit = 60): DockerEvent[] {
  return events.slice(0, limit);
}

// ── Armazenamento (docker system df) ─────────────────────────────────────
export interface StorageItem { name: string; kind: 'container' | 'volume'; sizeBytes: number; path: string }

export async function storage(): Promise<StorageItem[]> {
  const df: any = await new Promise((res, rej) =>
    docker.df((e: unknown, d: unknown) => (e ? rej(e) : res(d))),
  );
  const containers: StorageItem[] = (df.Containers ?? []).map((c: any) => ({
    name: (c.Names?.[0] || '').replace(/^\//, ''),
    kind: 'container' as const,
    sizeBytes: c.SizeRw || 0,
    path: c.Image || '',
  }));
  const volumes: StorageItem[] = (df.Volumes ?? []).map((v: any) => ({
    name: v.Name,
    kind: 'volume' as const,
    sizeBytes: v.UsageData?.Size ?? 0,
    path: v.Mountpoint || '',
  }));
  return [...volumes, ...containers].filter((x) => x.sizeBytes > 0).sort((a, b) => b.sizeBytes - a.sizeBytes);
}

// Começa a coletar eventos, o agendador e o histórico de métricas no boot da API.
startDockerEvents();
startScheduler();
startMetricsCollector();
