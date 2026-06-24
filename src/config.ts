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

export const config = {
  root,
  port: Number(process.env.PORT || 8088),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  dockerSocket: process.env.DOCKER_SOCKET || '/var/run/docker.sock',
  // Socket Proxy (Tecnativa) opcional: quando LITEDOCK_DOCKER_PROXY=host:porta,
  // o dockerode fala com a Engine pelo proxy restrito em vez do socket cru.
  // Vazio (padrão) = socket direto, comportamento de hoje.
  dockerProxy: process.env.LITEDOCK_DOCKER_PROXY || '',
  databaseUrl: process.env.DATABASE_URL || '',
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6390',
  encryptionKey: process.env.ENCRYPTION_KEY || 'dev-encryption-key-change-me-32bytes',
  traefikNetwork: process.env.TRAEFIK_NETWORK || 'litedock',
  // Worker de automação de deploy (Python/FastAPI, loopback).
  deployWorkerUrl: process.env.DEPLOY_WORKER_URL || 'http://127.0.0.1:8089',
};
