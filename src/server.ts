import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { ZodError } from 'zod';
import { config } from './config.js';
import { prisma, ensureLocalServer } from './db.js';
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import serviceRoutes from './routes/services.js';
import serverRoutes from './routes/servers.js';
import domainRoutes from './routes/domains.js';
import templateRoutes from './routes/templates.js';
import webhookRoutes from './routes/webhooks.js';
import settingsRoutes from './routes/settings.js';
import userRoutes from './routes/users.js';
import githubRoutes from './routes/github.js';
import { reconcileInterruptedDeploys } from './services/deploy.js';

// Permite serializar BigInt (ex.: Backup.sizeBytes) como JSON.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

const app = Fastify({ logger: { transport: undefined, level: 'info' } });

await app.register(cors, { origin: true });
await app.register(jwt, { secret: config.jwtSecret });

// Decorator de autenticacao.
app.decorate('authenticate', async (req, reply) => {
  try {
    await req.jwtVerify();
  } catch {
    reply.code(401).send({ error: 'nao autenticado' });
  }
});

// Erros de validacao Zod -> 400.
app.setErrorHandler((err, _req, reply) => {
  if (err instanceof ZodError) {
    return reply.code(400).send({ error: 'dados invalidos', issues: err.issues });
  }
  app.log.error(err);
  const e = err as { statusCode?: number; message?: string };
  return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'erro interno' });
});

app.get('/health', async () => ({ ok: true, service: 'litedock', version: '0.9.2' }));

await app.register(authRoutes, { prefix: '/auth' });
await app.register(projectRoutes, { prefix: '/projects' });
await app.register(serviceRoutes, { prefix: '/services' });
await app.register(serverRoutes, { prefix: '/servers' });
await app.register(domainRoutes, { prefix: '/domains' });
await app.register(templateRoutes, { prefix: '/templates' });
await app.register(settingsRoutes, { prefix: '/settings' });
await app.register(userRoutes, { prefix: '/users' });
await app.register(githubRoutes, { prefix: '/github' });
// Webhooks de CI/CD: público (autenticado por token do serviço), sem JWT.
await app.register(webhookRoutes, { prefix: '/webhooks' });

// Encerramento gracioso: para de aceitar conexões e reconcilia deploys em voo
// (marca como falha + limpa containers temporários) antes de sair. pm2 manda
// SIGINT no restart; um timeout garante que não travamos pendurados.
let shuttingDown = false;
async function gracefulShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  // console.log (síncrono) e não pino: o pino bufferiza e a linha se perderia no
  // process.exit. Esta linha confirma que o sinal chegou no handler.
  console.log(`[shutdown] Encerrando (${signal}) — reconciliando deploys em voo...`);
  const kill = setTimeout(() => { console.log('[shutdown] timeout — saída forçada'); process.exit(0); }, 10000);
  try {
    // app.close() para de aceitar conexões. Damos teto de 3s: sem SSE ele fecha
    // rápido, mas não pode SEGURAR o reconcile (que é o que de fato importa aqui).
    await Promise.race([app.close(), new Promise((r) => setTimeout(r, 3000))]);
    await reconcileInterruptedDeploys(`API encerrando (${signal})`);
    await prisma.$disconnect().catch(() => {});
  } catch (e) {
    console.error('[shutdown] erro:', e);
  } finally {
    clearTimeout(kill);
    process.exit(0);
  }
}
process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));

const start = async () => {
  try {
    await prisma.$connect();
    await ensureLocalServer();
    // Reconcilia deploys que ficaram presos de uma execução anterior (cobre
    // também crash duro, onde o handler de sinal não chegou a rodar).
    await reconcileInterruptedDeploys('API iniciando (reconciliação de boot)').catch((e) => app.log.error(e));
    await app.listen({ port: config.port, host: '127.0.0.1' });
    app.log.info(`LiteDock API no ar em http://127.0.0.1:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
