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

app.get('/health', async () => ({ ok: true, service: 'litedock', version: '0.6.0' }));

await app.register(authRoutes, { prefix: '/auth' });
await app.register(projectRoutes, { prefix: '/projects' });
await app.register(serviceRoutes, { prefix: '/services' });
await app.register(serverRoutes, { prefix: '/servers' });
await app.register(domainRoutes, { prefix: '/domains' });
await app.register(templateRoutes, { prefix: '/templates' });
// Webhooks de CI/CD: público (autenticado por token do serviço), sem JWT.
await app.register(webhookRoutes, { prefix: '/webhooks' });

const start = async () => {
  try {
    await prisma.$connect();
    await ensureLocalServer();
    await app.listen({ port: config.port, host: '127.0.0.1' });
    app.log.info(`LiteDock API no ar em http://127.0.0.1:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
