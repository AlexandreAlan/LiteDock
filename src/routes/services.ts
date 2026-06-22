import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { encrypt, decrypt } from '../lib/crypto.js';
import * as deploy from '../services/deploy.js';
import { workerDeploy, workerHealth, type WorkerSpec } from '../services/worker.js';

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

  // ---- deploy ----
  app.post('/:id/deploy', async (req, reply) => {
    const { id } = req.params as { id: string };
    const s = await loadOwned(req, id);
    if (!s) return reply.code(404).send({ error: 'serviço não encontrado' });
    try {
      const result = await deploy.deployService(id);
      return result;
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
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
        if (action === 'start') await deploy.startService(s.containerId);
        if (action === 'stop') await deploy.stopService(s.containerId);
        if (action === 'restart') await deploy.restartService(s.containerId);
        const status = action === 'stop' ? 'stopped' : 'running';
        await prisma.service.update({ where: { id }, data: { status } });
        return { ok: true, status };
      } catch (e) {
        return reply.code(400).send({ error: (e as Error).message });
      }
    });
  }

  // Remove o serviço (container + registro).
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const s = await loadOwned(req, id);
    if (!s) return reply.code(404).send({ error: 'serviço não encontrado' });
    await deploy.removeContainer(s.containerId);
    await prisma.service.delete({ where: { id } });
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
