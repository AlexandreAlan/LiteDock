// Cliente do worker de deploy em Python (FastAPI). O Node monta o spec e
// delega a automação (pull/run/stop/logs) pro worker no loopback.
import { config } from '../config.js';

export interface WorkerSpec {
  name: string;
  image: string;
  project: string;
  ports: number[];
  volumes: string[];
  env: Record<string, string>;
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${config.deployWorkerUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`worker ${res.status}: ${txt || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export function workerDeploy(spec: WorkerSpec) {
  return call<{ dryRun: boolean; status: string; plan: unknown; containerId?: string }>('/deploy', spec);
}

export async function workerHealth() {
  const res = await fetch(`${config.deployWorkerUrl}/health`);
  if (!res.ok) throw new Error('worker indisponível');
  return res.json() as Promise<{ ok: boolean; safeMode: boolean }>;
}

// Chamadas genéricas ao worker (usadas pelas ações de sistema do host).
export async function workerGet<T>(path: string): Promise<T> {
  const res = await fetch(`${config.deployWorkerUrl}${path}`);
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`worker ${res.status}: ${txt || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export function workerPost<T>(path: string, body: unknown = {}): Promise<T> {
  return call<T>(path, body);
}

// ── Automação de rede (isolamento por projeto + pontes) — braçal no Python ──
export function ensureProjectNetwork(project: string) {
  return call<{ network: string }>('/network/ensure', { project });
}
export function bridgeProjects(projectA: string, projectB: string, connected: boolean) {
  return call<{ status: string; containersChanged: number }>('/network/bridge', { projectA, projectB, connected });
}
