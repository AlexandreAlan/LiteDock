// Telemetria detalhada do Docker para o Monitor (estilo EasyPanel):
//  • stats por container (CPU% / memória / rede ↓↑)
//  • stream de eventos do Docker (buffer em memória)
//  • uso de armazenamento (containers + volumes via `docker system df`)
import { docker } from './docker.js';

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

export interface ContainerStat {
  id: string; name: string; project: string | null; managed: boolean;
  cpuPct: number; memBytes: number; netInBps: number; netOutBps: number;
}

export async function containerStats(): Promise<ContainerStat[]> {
  const list = await docker.listContainers(); // só os em execução
  const now = Date.now();
  const rows = await Promise.all(
    list.map(async (c) => {
      const name = (c.Names?.[0] || '').replace(/^\//, '');
      const base = {
        id: c.Id.slice(0, 12),
        name,
        project: (c.Labels?.['litedock.project'] as string) || null,
        managed: c.Labels?.['litedock.managed'] === 'true',
      };
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
  return rows.sort((a, b) => b.memBytes - a.memBytes);
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

// Começa a coletar eventos assim que o módulo carrega (boot da API).
startDockerEvents();
