import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { encrypt, decrypt } from '../lib/crypto.js';
import * as deploy from '../services/deploy.js';
import { docker } from '../services/docker.js';
import { enqueue } from '../lib/queue.js';
import { workerDeploy, workerHealth, type WorkerSpec } from '../services/worker.js';
import { getMetricsHistory } from '../services/monitor.js';

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

  // Histórico de métricas (CPU/RAM/rede) do container do serviço — alimenta os gráficos.
  app.get('/:id/metrics-history', async (req, reply) => {
    const { id } = req.params as { id: string };
    const s = await loadOwned(req, id);
    if (!s) return reply.code(404).send({ error: 'serviço não encontrado' });
    const name = deploy.containerName(s.project.slug, s.name);
    return { samples: getMetricsHistory(name) };
  });

  // Detalhe (segredos mascarados). Status sincronizado com Docker quando há containerId.
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const s = await loadOwned(req, id);
    if (!s) return reply.code(404).send({ error: 'serviço não encontrado' });

    let liveStatus = s.status;
    if (s.containerId) {
      try {
        const info = await docker.getContainer(s.containerId).inspect();
        const st = info.State as { Running: boolean; Health?: { Status: string } };
        if (st.Running) {
          const health = st.Health?.Status;
          liveStatus = (health === 'unhealthy' || health === 'starting') ? 'restarting' : 'running';
        } else {
          liveStatus = 'stopped';
        }
        if (liveStatus !== s.status) {
          prisma.service.update({ where: { id }, data: { status: liveStatus } }).catch(() => {});
        }
      } catch {
        liveStatus = 'stopped';
      }
    }

    return {
      ...s,
      status: liveStatus,
      envVars: s.envVars.map((e) => ({ key: e.key, value: e.isSecret ? '••••••' : e.value, isSecret: e.isSecret })),
    };
  });

  // Atualiza configuração do serviço (spec: source/repo/imagem/porta…) e nome.
  // O spec é mesclado (merge raso) pra não perder campos não enviados.
  app.patch('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({
      name: z.string().min(1).optional(),
      spec: z.record(z.any()).optional(),
    }).parse(req.body);
    const s = await loadOwned(req, id);
    if (!s) return reply.code(404).send({ error: 'serviço não encontrado' });
    const mergedSpec = body.spec ? { ...(s.spec as object), ...body.spec } : (s.spec as object);
    const updated = await prisma.service.update({
      where: { id },
      data: { ...(body.name ? { name: body.name } : {}), spec: mergedSpec },
    });
    return updated;
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

  // Revela o valor real de uma variável secreta (decifrado). Só o dono do serviço.
  app.get('/:id/env/:key/reveal', async (req, reply) => {
    const { id, key } = req.params as { id: string; key: string };
    const s = await loadOwned(req, id);
    if (!s) return reply.code(404).send({ error: 'serviço não encontrado' });
    const ev = s.envVars.find((e) => e.key === decodeURIComponent(key));
    if (!ev) return reply.code(404).send({ error: 'variável não encontrada' });
    return { key: ev.key, value: ev.isSecret ? decrypt(ev.value) : ev.value };
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
    // PUBLIC_URL tem prioridade; fallback lê panelCustomDomain dos ajustes
    // (inclui /api pois o nginx faz proxy /api/ → backend).
    let base = process.env.PUBLIC_URL;
    if (!base) {
      const setting = await prisma.setting.findUnique({ where: { key: 'panelCustomDomain' } });
      const domain = setting?.value?.trim() || req.hostname;
      base = `https://${domain}/api`;
    }
    return { url: `${base}/webhooks/services/${id}/deploy?token=${token}` };
  });

  // Lista deployments paginados (skip/take) — suporta "carregar mais" no frontend.
  app.get('/:id/deployments', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { skip = '0', take = '10' } = req.query as { skip?: string; take?: string };
    const s = await loadOwned(req, id);
    if (!s) return reply.code(404).send({ error: 'serviço não encontrado' });
    const list = await prisma.deployment.findMany({
      where: { serviceId: id },
      orderBy: { startedAt: 'desc' },
      skip: Math.max(0, Number(skip)),
      take: Math.min(50, Math.max(1, Number(take))),
    });
    const total = await prisma.deployment.count({ where: { serviceId: id } });
    return { deployments: list, total };
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
