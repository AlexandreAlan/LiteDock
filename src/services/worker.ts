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

// Segredo compartilhado Node↔worker (ver config.ts): a VPS hospeda vários
// produtos como processos independentes no MESMO namespace de rede loopback —
// sem este header, qualquer outro processo local alcançaria o worker e
// controlaria o Docker do host sem passar pela autenticação/RBAC do LiteDock.
// Vazio (instalação que ainda não gerou o token) preserva o comportamento
// anterior — o worker aceita sem header quando ele mesmo não tem o token
// configurado (compat), mas loga um aviso no boot recomendando configurar.
function authHeaders(): Record<string, string> {
  return config.deployWorkerToken ? { Authorization: `Bearer ${config.deployWorkerToken}` } : {};
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${config.deployWorkerUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders() },
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
  const res = await fetch(`${config.deployWorkerUrl}${path}`, { headers: authHeaders() });
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
