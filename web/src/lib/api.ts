// Client HTTP fino sobre a API Fastify do LiteDock. Base sempre "/api"
// (dev: proxy do Vite; prod: proxy do nginx). Bearer guardado no localStorage.

const TOKEN_KEY = 'litedock_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string | null) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    setToken(null);
    // deixa o AuthProvider redirecionar; ainda assim sinaliza o erro
  }

  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `Erro ${res.status}`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

function safeJson(t: string) {
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b?: unknown) => request<T>('POST', p, b),
  put: <T>(p: string, b?: unknown) => request<T>('PUT', p, b),
  del: <T>(p: string) => request<T>('DELETE', p),
};

// ── Tipos do domínio (espelham o backend v2) ──────────────────────────────
export interface User {
  id: string;
  email: string;
  name?: string | null;
  role: string;
}
export interface Project {
  id: string;
  name: string;
  slug?: string;
  createdAt?: string;
  services?: Service[];
}
export type ServiceType = 'app' | 'database';
export interface Service {
  id: string;
  name: string;
  type: ServiceType;
  status?: string | null; // created|deploying|running|stopped|error
  containerId?: string | null;
  spec?: Record<string, unknown>;
  projectId?: string;
  domains?: Domain[];
  createdAt?: string;
}
export interface EnvVar {
  key: string;
  value: string;
  isSecret: boolean;
}
export interface Domain {
  id: string;
  host: string;
  targetPort?: number;
  https?: boolean;
  certStatus?: string;
}
export interface Deployment {
  id: string;
  status: string;
  trigger: string;
  imageTag?: string | null;
  startedAt: string;
  finishedAt?: string | null;
}
export interface ServiceFull extends Service {
  project?: Project;
  envVars?: EnvVar[];
  domains?: Domain[];
  deployments?: Deployment[];
}
export interface EngineInfo {
  containers?: number;
  containersRunning?: number;
  containersStopped?: number;
  images?: number;
  serverVersion?: string;
  ncpu?: number;
  memTotal?: number;
  name?: string;
  [k: string]: unknown;
}
export interface HostContainer {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  managed?: boolean;
}
export interface HostMetrics {
  hostname: string;
  publicIp?: string;
  uptimeSec: number;
  cpu: { pct: number; cores: number; load: number[] };
  memory: { usedBytes: number; totalBytes: number; pct: number };
  disk: { usedBytes: number; totalBytes: number; pct: number };
  network: { inBps: number; outBps: number };
}
export interface DomainFull {
  id: string;
  host: string;
  targetPort: number;
  https: boolean;
  certStatus: string;
  service?: { id: string; name: string; project?: { id: string; name: string } };
}
