import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../db.js';
import { listContainers, engineInfo, docker } from '../services/docker.js';
import { hostMetrics } from '../services/metrics.js';
import { containerStats, dockerEvents, storage, startContainer, stopContainer, isManaged } from '../services/monitor.js';
import { workerGet, workerPost, workerHealth } from '../services/worker.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as { version: string };
const CURRENT_VERSION = pkg.version;

export default async function serverRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // ── Ações de sistema do host (delegadas ao worker Python) ──────────────
  app.get('/local/system/df', async (_req, reply) => {
    try { return await workerGet('/system/df'); }
    catch (e) { return reply.code(502).send({ error: (e as Error).message }); }
  });
  app.get('/local/system/worker', async () => {
    try { return { ...(await workerHealth()), online: true }; }
    catch { return { online: false, ok: false, safeMode: true }; }
  });
  app.post('/local/system/prune', async (_req, reply) => {
    try { return await workerPost('/system/prune'); }
    catch (e) { return reply.code(502).send({ error: (e as Error).message }); }
  });
  app.post('/local/system/traefik/restart', async (_req, reply) => {
    try { return await workerPost('/system/traefik/restart'); }
    catch (e) { return reply.code(502).send({ error: (e as Error).message }); }
  });
  app.get('/local/system/traefik/logs', async (req, reply) => {
    const { tail } = req.query as { tail?: string };
    try { return await workerGet(`/system/traefik/logs?tail=${Number(tail) || 200}`); }
    catch (e) { return reply.code(502).send({ error: (e as Error).message }); }
  });
  app.post('/local/system/panel/restart', async (_req, reply) => {
    try { return await workerPost('/system/panel/restart'); }
    catch (e) { return reply.code(502).send({ error: (e as Error).message }); }
  });

  // Versão atual do painel (lida do package.json).
  app.get('/local/version', async () => ({ version: CURRENT_VERSION }));

  // Ping da Docker Engine (versao).
  app.get('/local/engine', async () => engineInfo());

  // Visao da VPS: containers do host.
  app.get('/local/containers', async () => listContainers());

  // Métricas do host: CPU / memória / disco / rede (estilo EasyPanel).
  app.get('/local/metrics', async () => hostMetrics());

  // Monitor (estilo EasyPanel): stats por container, eventos e armazenamento.
  app.get('/local/container-stats', async () => containerStats());
  app.get('/local/docker-events', async (req) => {
    const { limit } = req.query as { limit?: string };
    return dockerEvents(Number(limit) || 60);
  });
  app.get('/local/storage', async () => storage());

  // Ações por container do host: iniciar / parar (mexe em containers reais).
  app.post('/local/containers/:name/start', async (req, reply) => {
    const { name } = req.params as { name: string };
    try { await startContainer(name); return { ok: true }; }
    catch (e) { return reply.code(400).send({ error: (e as Error).message }); }
  });
  app.post('/local/containers/:name/stop', async (req, reply) => {
    const { name } = req.params as { name: string };
    try { await stopContainer(name); return { ok: true }; }
    catch (e) { return reply.code(400).send({ error: (e as Error).message }); }
  });

  // Agendamento diário (liga/desliga por horário) por container.
  app.get('/local/containers/:name/schedule', async (req) => {
    const { name } = req.params as { name: string };
    const sched = await prisma.containerSchedule.findUnique({ where: { containerName: name } });
    return sched ?? { containerName: name, startTime: null, stopTime: null, enabled: false };
  });
  app.put('/local/containers/:name/schedule', async (req, reply) => {
    const { name } = req.params as { name: string };
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
  app.delete('/local/containers/:name/schedule', async (req) => {
    const { name } = req.params as { name: string };
    await prisma.containerSchedule.deleteMany({ where: { containerName: name } });
    return { ok: true };
  });

  // Logs de qualquer container pelo nome (últimas N linhas, stdout+stderr).
  app.get('/local/containers/:name/logs', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { name } = req.params as { name: string };
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

  // Restart de qualquer container pelo nome.
  app.post('/local/containers/:name/restart', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { name } = req.params as { name: string };
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
