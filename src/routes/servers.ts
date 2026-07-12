import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../db.js';
import { listContainers, engineInfo, docker } from '../services/docker.js';
import { hostMetrics } from '../services/metrics.js';
import { containerStats, dockerEvents, storage, startContainer, stopContainer, isManaged } from '../services/monitor.js';
import { workerGet, workerPost, workerHealth } from '../services/worker.js';
import { requireAdminHook } from '../lib/rbac.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as { version: string };
const CURRENT_VERSION = pkg.version;

// As rotas /local/containers/:name/* operam em UM container específico do
// host. Um dono comum (role member) só pode agir sobre o container do PRÓPRIO
// serviço (registrado em Service.containerId, checado por ownerId) — nunca
// sobre o de outro tenant. owner/admin têm acesso irrestrito (visão de VPS).
// Sem esta checagem, qualquer usuário autenticado do painel conseguia
// start/stop/restart/logs/agendamento de QUALQUER container gerenciado, de
// QUALQUER outro tenant, bastando adivinhar o nome (padrão previsível:
// litedock-<slug-do-projeto>-<nome-do-serviço>).
async function assertContainerAccess(req: FastifyRequest, reply: FastifyReply, name: string): Promise<boolean> {
  if (req.user.role === 'owner' || req.user.role === 'admin') return true;
  const owned = await prisma.service.findFirst({
    where: { containerId: name, project: { ownerId: req.user.sub } },
    select: { id: true },
  });
  if (owned) return true;
  reply.code(403).send({ error: 'sem permissão sobre este container' });
  return false;
}

export default async function serverRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // ── Ações de sistema do host (delegadas ao worker Python) ──────────────
  // Não são por-tenant (system df/prune, restart do Traefik/painel inteiro) —
  // só owner/admin, mesmo padrão de pm2.ts/tools.ts/devspace.ts.
  app.get('/local/system/df', { onRequest: [requireAdminHook] }, async (_req, reply) => {
    try { return await workerGet('/system/df'); }
    catch (e) { return reply.code(502).send({ error: (e as Error).message }); }
  });
  app.get('/local/system/worker', { onRequest: [requireAdminHook] }, async () => {
    try { return { ...(await workerHealth()), online: true }; }
    catch { return { online: false, ok: false, safeMode: true }; }
  });
  app.post('/local/system/prune', { onRequest: [requireAdminHook] }, async (_req, reply) => {
    try { return await workerPost('/system/prune'); }
    catch (e) { return reply.code(502).send({ error: (e as Error).message }); }
  });
  app.post('/local/system/traefik/restart', { onRequest: [requireAdminHook] }, async (_req, reply) => {
    try { return await workerPost('/system/traefik/restart'); }
    catch (e) { return reply.code(502).send({ error: (e as Error).message }); }
  });
  app.get('/local/system/traefik/logs', { onRequest: [requireAdminHook] }, async (req, reply) => {
    const { tail } = req.query as { tail?: string };
    try { return await workerGet(`/system/traefik/logs?tail=${Number(tail) || 200}`); }
    catch (e) { return reply.code(502).send({ error: (e as Error).message }); }
  });
  app.post('/local/system/panel/restart', { onRequest: [requireAdminHook] }, async (_req, reply) => {
    try { return await workerPost('/system/panel/restart'); }
    catch (e) { return reply.code(502).send({ error: (e as Error).message }); }
  });

  // Versão atual do painel (lida do package.json) — sem dado sensível.
  app.get('/local/version', async () => ({ version: CURRENT_VERSION }));

  // Ping da Docker Engine (versao) — telemetria do host, não por-tenant.
  app.get('/local/engine', { onRequest: [requireAdminHook] }, async () => engineInfo());

  // Visao da VPS: containers do host — inclui nomes/imagens de TODOS os
  // tenants, não só do requisitante.
  app.get('/local/containers', { onRequest: [requireAdminHook] }, async () => listContainers());

  // Métricas do host: CPU / memória / disco / rede (estilo EasyPanel).
  app.get('/local/metrics', { onRequest: [requireAdminHook] }, async () => hostMetrics());

  // Monitor (estilo EasyPanel): stats por container, eventos e armazenamento
  // — cobre TODOS os containers do host, de todos os tenants.
  app.get('/local/container-stats', { onRequest: [requireAdminHook] }, async () => containerStats());
  app.get('/local/docker-events', { onRequest: [requireAdminHook] }, async (req) => {
    const { limit } = req.query as { limit?: string };
    return dockerEvents(Number(limit) || 60);
  });
  app.get('/local/storage', { onRequest: [requireAdminHook] }, async () => storage());

  // Ações por container do host: iniciar / parar (mexe em containers reais).
  app.post('/local/containers/:name/start', async (req, reply) => {
    const { name } = req.params as { name: string };
    if (!(await assertContainerAccess(req, reply, name))) return;
    try { await startContainer(name); return { ok: true }; }
    catch (e) { return reply.code(400).send({ error: (e as Error).message }); }
  });
  app.post('/local/containers/:name/stop', async (req, reply) => {
    const { name } = req.params as { name: string };
    if (!(await assertContainerAccess(req, reply, name))) return;
    try { await stopContainer(name); return { ok: true }; }
    catch (e) { return reply.code(400).send({ error: (e as Error).message }); }
  });

  // Agendamento diário (liga/desliga por horário) por container.
  app.get('/local/containers/:name/schedule', async (req, reply) => {
    const { name } = req.params as { name: string };
    if (!(await assertContainerAccess(req, reply, name))) return;
    const sched = await prisma.containerSchedule.findUnique({ where: { containerName: name } });
    return sched ?? { containerName: name, startTime: null, stopTime: null, enabled: false };
  });
  app.put('/local/containers/:name/schedule', async (req, reply) => {
    const { name } = req.params as { name: string };
    if (!(await assertContainerAccess(req, reply, name))) return;
    // Só agenda containers do próprio LiteDock — não toca os de produção do host.
    if (!(await isManaged(name)))
      return reply.code(400).send({ error: `"${name}" não é gerenciado pelo LiteDock; agendamento permitido só para serviços do painel.` });
    const body = z.object({
      startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
      stopTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
      enabled: z.boolean().optional(),
    }).parse(req.body);
    return prisma.containerSchedule.upsert({
      where: { containerName: name },
      create: { containerName: name, startTime: body.startTime ?? null, stopTime: body.stopTime ?? null, enabled: body.enabled ?? true },
      update: { startTime: body.startTime ?? null, stopTime: body.stopTime ?? null, ...(body.enabled !== undefined ? { enabled: body.enabled } : {}) },
    });
  });
  app.delete('/local/containers/:name/schedule', async (req, reply) => {
    const { name } = req.params as { name: string };
    if (!(await assertContainerAccess(req, reply, name))) return;
    await prisma.containerSchedule.deleteMany({ where: { containerName: name } });
    return { ok: true };
  });

  // Logs de um container pelo nome (últimas N linhas, stdout+stderr) — só o
  // dono do serviço (ou owner/admin): pode conter segredos/PII do tenant.
  app.get('/local/containers/:name/logs', async (req, reply) => {
    const { name } = req.params as { name: string };
    if (!(await assertContainerAccess(req, reply, name))) return;
    const { tail } = req.query as { tail?: string };
    const lines = Math.min(Number(tail) || 200, 2000);
    try {
      const containers = await docker.listContainers({ all: true });
      const found = containers.find((c) => (c.Names ?? []).some((n) => n.replace(/^\//, '') === name));
      if (!found) return reply.code(404).send({ error: `Container "${name}" não encontrado` });
      const c = docker.getContainer(found.Id);
      const buf = (await c.logs({ stdout: true, stderr: true, tail: lines, timestamps: false })) as unknown as Buffer;
      // demux do protocolo multiplexado Docker
      let out = '';
      let i = 0;
      while (i + 8 <= buf.length) {
        const size = buf.readUInt32BE(i + 4);
        const chunk = buf.slice(i + 8, i + 8 + size).toString('utf8');
        out += chunk;
        i += 8 + size;
      }
      return { logs: out || buf.toString('utf8') };
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  // Restart de um container pelo nome — mesma regra de posse acima.
  app.post('/local/containers/:name/restart', async (req, reply) => {
    const { name } = req.params as { name: string };
    if (!(await assertContainerAccess(req, reply, name))) return;
    try {
      const containers = await docker.listContainers({ all: true });
      const found = containers.find((c) => (c.Names ?? []).some((n) => n.replace(/^\//, '') === name));
      if (!found) return reply.code(404).send({ error: `Container "${name}" não encontrado` });
      await docker.getContainer(found.Id).restart();
      return { ok: true };
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });
}
