// Carrega .env (nativo do Node) e expoe config tipada.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
if (existsSync(envPath)) {
  try {
    process.loadEnvFile(envPath);
  } catch (e) {
    console.warn('[config] nao consegui carregar .env:', (e as Error).message);
  }
}

// Segredos SEM fallback: um valor padrão previsível aqui permitiria forjar JWTs
// válidos (login como qualquer usuário/role) ou decifrar todo segredo em
// repouso (env vars de serviço, tokens de GitHub) em qualquer instalação que
// esquecesse de configurar o .env. Falha rápido e alto no boot em vez de subir
// silenciosamente inseguro — mais barato de corrigir num deploy que nunca subiu
// do que descobrir depois de exposto.
function requireSecret(name: string, minLength = 32): string {
  const v = process.env[name];
  if (!v || v.length < minLength) {
    throw new Error(
      `[config] ${name} ausente ou fraco (mínimo ${minLength} caracteres). ` +
      `Gere um valor forte com: openssl rand -hex 32 — veja .env.example.`,
    );
  }
  return v;
}

export const config = {
  root,
  port: Number(process.env.PORT || 8088),
  jwtSecret: requireSecret('JWT_SECRET'),
  // Duração do token de sessão. Expirado, o usuário precisa logar de novo — um
  // token vazado (ex.: XSS) para de funcionar sozinho depois desse prazo, em
  // vez de valer para sempre. Combinado com tokenVersion (revogação manual).
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  dockerSocket: process.env.DOCKER_SOCKET || '/var/run/docker.sock',
  // Socket Proxy (Tecnativa) opcional: quando LITEDOCK_DOCKER_PROXY=host:porta,
  // o dockerode fala com a Engine pelo proxy restrito em vez do socket cru.
  // Vazio (padrão) = socket direto, comportamento de hoje.
  dockerProxy: process.env.LITEDOCK_DOCKER_PROXY || '',
  databaseUrl: process.env.DATABASE_URL || '',
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6390',
  encryptionKey: requireSecret('ENCRYPTION_KEY'),
  traefikNetwork: process.env.TRAEFIK_NETWORK || 'litedock',
  // Worker de automação de deploy (Python/FastAPI, loopback).
  deployWorkerUrl: process.env.DEPLOY_WORKER_URL || 'http://127.0.0.1:8089',
  // Segredo compartilhado Node↔worker: a VPS hospeda vários produtos como
  // processos independentes no MESMO namespace de rede — sem esse token,
  // qualquer processo local (de outro produto) que alcançasse o loopback
  // controlaria o Docker do host sem passar pela autenticação/RBAC do LiteDock.
  deployWorkerToken: process.env.DEPLOY_WORKER_TOKEN || '',
  // Limites de recurso PADRÃO aplicados a cada container de tenant. Defesa contra
  // abuso (CPU/RAM exauridos como no incidente do cryptominer, fork-bomb).
  // Sobrescrevíveis por env por instalação.
  deployMemMB: Number(process.env.LITEDOCK_DEFAULT_MEM_MB || 1024),   // RAM máx (MB)
  deployCpus: Number(process.env.LITEDOCK_DEFAULT_CPUS || 1),         // nº de vCPUs
  deployPidsLimit: Number(process.env.LITEDOCK_DEFAULT_PIDS || 512),  // limite de processos (anti fork-bomb)
};
