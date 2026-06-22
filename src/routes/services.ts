import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { encrypt, decrypt } from '../lib/crypto.js';
import * as deploy from '../services/deploy.js';
import { enqueue } from '../lib/queue.js';
import { workerDeploy, workerHealth, type WorkerSpec } from '../services/worker.js';

// Chave de lock por serviço: deploy e ciclo de vida do mesmo serviço serializam.
const lockKey = (id: string) => `deploy:${id}`;

// Carrega um serviço garantindo que pertence a um projeto do usuário logado.
async function loadOwned(req: FastifyRequest, id: string) {
  return prisma.service.findFirst({
    where: { id, project: { ownerId: req.user.sub } },
    include: { project: true, envVars: true, domains: true, deployments: { orderBy: { startedAt: 'desc' }, take: 10 } },
  });
}

export default async function serviceRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // Detalhe (segredos mascarados).
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const s = await loadOwned(req, id);
    if (!s) return reply.code(404).send({ error: 'serviço não encontrado' });
    return {
      ...s,
      envVars: s.envVars.map((e) => ({ key: e.key, value: e.isSecret ? '••••••' : e.value, isSecret: e.isSecret })),
    };
  });

  // ---- env vars ----
  app.post('/:id/env', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ key: z.string().min(1), value: z.string(), isSecret: z.boolean().default(true) }).parse(req.body);
    const s = await loadOwned(req, id);
    if (!s) return reply.code(404).send({ error: 'serviço não encontrado' });
    const stored = body.isSecret ? encrypt(body.value) : body.value;
    await prisma.envVar.upsert({
      where: { serviceId_key: { serviceId: id, key: body.key } },
      create: { serviceId: id, key: body.key, value: stored, isSecret: body.isSecret },
      update: { value: stored, isSecret: body.isSecret },
    });
    reply.code(201);
    return { ok: true, key: body.key };
  });

  app.delete('/:id/env/:key', async (req, reply) => {
    const { id, key } = req.params as { id: string; key: string };
    const s = await loadOwned(req, id);
    if (!s) return reply.code(404).send({ error: 'serviço não encontrado' });
    await prisma.envVar.deleteMany({ where: { serviceId: id, key } });
    return { removed: key };
  });

  // ---- domínios ----
  app.post('/:id/domains', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ host: z.string().min(3), targetPort: z.number().int().positive(), https: z.boolean().default(true) }).parse(req.body);
    const s = await loadOwned(req, id);
    if (!s) return reply.code(404).send({ error: 'serviço não encontrado' });
    const exists = await prisma.domain.findUnique({ where: { host: body.host } });
    if (exists) return reply.code(409).send({ error: 'domínio já em uso' });
    reply.code(201);
    return prisma.domain.create({ data: { serviceId: id, host: body.host, targetPort: body.targetPort, https: body.https } });
  });

  app.delete('/:id/domains/:domainId', async (req, reply) => {
    const { id, domainId } = req.params as { id: string; domainId: string };
    const s = await loadOwned(req, id);
    if (!s) return reply.code(404).send({ error: 'serviço não encontrado' });
    await prisma.domain.deleteMany({ where: { id: domainId, serviceId: id } });
    return { removed: domainId };
  });

  // ---- deploy (assíncrono) ----
  // Não bloqueia o request com o pull/build: enfileira (lock por serviço) e
  // responde 202 na hora. O frontend acompanha por GET /:id/deployments/:depId.
  app.post('/:id/deploy', async (req, reply) => {
    const { id } = req.params as { id: string };
    const s = await loadOwned(req, id);
    if (!s) return reply.code(404).send({ error: 'serviço não encontrado' });
    try {
      const { deployment, alreadyRunning } = await deploy.enqueueDeploy(id, 'manual');
      reply.code(202);
      return { deploymentId: deployment.id, status: deployment.status, alreadyRunning };
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  // Gera/rotaciona o token do webhook de deploy (CI/CD on-push). Devolve a URL
  // pronta pra colar no GitHub/GitLab (push → deploy automático).
  app.post('/:id/webhook', async (req, reply) => {
    const { id } = req.params as { id: string };
    const s = await loadOwned(req, id);
    if (!s) return reply.code(404).send({ error: 'serviço não encontrado' });
    const token = randomBytes(24).toString('hex');
    await prisma.service.update({ where: { id }, data: { deployToken: token } });
    const base = process.env.PUBLIC_URL || `http://127.0.0.1:${config.port}`;
    return { url: `${base}/webhooks/services/${id}/deploy?token=${token}` };
  });

  // Status de um deployment (polling do frontend durante o deploy).
  app.get('/:id/deployments/:depId', async (req, reply) => {
    const { id, depId } = req.params as { id: string; depId: string };
    const s = await loadOwned(req, id);
    if (!s) return reply.code(404).send({ error: 'serviço não encontrado' });
    const dep = await prisma.deployment.findFirst({ where: { id: depId, serviceId: id } });
    if (!dep) return reply.code(404).send({ error: 'deployment não encontrado' });
    return dep;
  });

  // ---- deploy via worker Python (automação) ----
  // Monta o spec a partir do registro e delega pro worker FastAPI.
  // Em modo seguro, o worker devolve o "plano" (dry-run) sem tocar no Docker.
  app.post('/:id/plan', async (req, reply) => {
    const { id } = req.params as { id: string };
    const s = await loadOwned(req, id);
    if (!s) return reply.code(404).send({ error: 'serviço não encontrado' });
    const spec = (s.spec ?? {}) as { image?: string; ports?: number[]; volumes?: string[] };
    if (!spec.image) return reply.code(400).send({ error: 'serviço sem imagem no spec' });

    const env: Record<string, string> = {};
    for (const e of s.envVars) env[e.key] = e.isSecret ? decrypt(e.value) : e.value;

    const payload: WorkerSpec = {
      name: s.name,
      image: spec.image,
      project: s.project.slug,
      ports: spec.ports ?? [],
      volumes: spec.volumes ?? [],
      env,
    };
    try {
      return await workerDeploy(payload);
    } catch (e) {
      return reply.code(502).send({ error: (e as Error).message });
    }
  });

  // Saúde do worker (mostra se está em modo seguro).
  app.get('/worker/health', async (_req, reply) => {
    try {
      return await workerHealth();
    } catch (e) {
      return reply.code(502).send({ error: (e as Error).message });
    }
  });

  // ---- ciclo de vida ----
  for (const action of ['start', 'stop', 'restart'] as const) {
    app.post(`/:id/${action}`, async (req, reply) => {
      const { id } = req.params as { id: string };
      const s = await loadOwned(req, id);
      if (!s) return reply.code(404).send({ error: 'serviço não encontrado' });
      try {
        // Serializa com o deploy: nada de parar/reiniciar no meio de uma troca.
        const status = await enqueue(lockKey(id), async () => {
          if (action === 'start') await deploy.startService(s.containerId);
          if (action === 'stop') await deploy.stopService(s.containerId);
          if (action === 'restart') await deploy.restartService(s.containerId);
          const st = action === 'stop' ? 'stopped' : 'running';
          await prisma.service.update({ where: { id }, data: { status: st } });
          return st;
        });
        return { ok: true, status };
      } catch (e) {
        return reply.code(400).send({ error: (e as Error).message });
      }
    });
  }

  // Remove o serviço (container + registro). Serializado com o deploy.
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const s = await loadOwned(req, id);
    if (!s) return reply.code(404).send({ error: 'serviço não encontrado' });
    await enqueue(lockKey(id), async () => {
      await deploy.removeContainer(s.containerId);
      await prisma.service.delete({ where: { id } });
    });
    return { removed: id };
  });

  // ---- observabilidade ----
  app.get('/:id/logs', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { tail } = req.query as { tail?: string };
    const s = await loadOwned(req, id);
    if (!s) return reply.code(404).send({ error: 'serviço não encontrado' });
    try {
      return { logs: await deploy.serviceLogs(s.containerId, Number(tail) || 200) };
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  app.get('/:id/stats', async (req, reply) => {
    const { id } = req.params as { id: string };
    const s = await loadOwned(req, id);
    if (!s) return reply.code(404).send({ error: 'serviço não encontrado' });
    try {
      return await deploy.serviceStats(s.containerId);
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });
}
