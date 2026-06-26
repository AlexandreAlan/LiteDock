import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, ensureLocalServer } from '../db.js';
import { bridgeProjects } from '../services/worker.js';

const slugify = (s: string) =>
  s.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

export default async function projectRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // Lista os projetos do usuario.
  app.get('/', async (req) => {
    return prisma.project.findMany({
      where: { ownerId: req.user.sub },
      include: { services: { include: { domains: true } } },
      orderBy: { createdAt: 'desc' },
    });
  });

  // Cria um projeto (workspace).
  app.post('/', async (req, reply) => {
    const { name } = z.object({ name: z.string().min(1) }).parse(req.body);
    const slug = slugify(name);
    const exists = await prisma.project.findUnique({
      where: { ownerId_slug: { ownerId: req.user.sub, slug } },
    });
    if (exists) return reply.code(409).send({ error: 'ja existe um projeto com esse nome' });
    reply.code(201);
    return prisma.project.create({ data: { name, slug, ownerId: req.user.sub } });
  });

  // Detalhe de um projeto.
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = await prisma.project.findFirst({
      where: { id, ownerId: req.user.sub },
      include: { services: { include: { domains: true } } },
    });
    if (!project) return reply.code(404).send({ error: 'projeto nao encontrado' });
    return project;
  });

  // Renomeia um projeto (só o campo name; o slug não muda pois os containers o usam).
  app.patch('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { name } = z.object({ name: z.string().min(1) }).parse(req.body);
    const project = await prisma.project.findFirst({ where: { id, ownerId: req.user.sub } });
    if (!project) return reply.code(404).send({ error: 'projeto nao encontrado' });
    return prisma.project.update({ where: { id }, data: { name } });
  });

  // Remove um projeto (e seus serviços, em cascata no banco).
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = await prisma.project.findFirst({ where: { id, ownerId: req.user.sub } });
    if (!project) return reply.code(404).send({ error: 'projeto nao encontrado' });
    await prisma.project.delete({ where: { id } });
    return { removed: id };
  });

  // ── Pontes de rede entre projetos (isolamento é o padrão) ──────────────
  // Lista os projetos "pontes" deste projeto + os outros projetos disponíveis.
  app.get('/:id/bridges', async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = await prisma.project.findFirst({ where: { id, ownerId: req.user.sub } });
    if (!project) return reply.code(404).send({ error: 'projeto nao encontrado' });
    const bridges = await prisma.projectBridge.findMany({
      where: { OR: [{ aId: id }, { bId: id }] },
      include: { a: true, b: true },
    });
    const connected = bridges.map((br) => {
      const peer = br.aId === id ? br.b : br.a;
      return { bridgeId: br.id, id: peer.id, name: peer.name, slug: peer.slug };
    });
    const all = await prisma.project.findMany({
      where: { ownerId: req.user.sub, id: { not: id } },
      orderBy: { name: 'asc' },
    });
    const connectedIds = new Set(connected.map((c) => c.id));
    const available = all.filter((p) => !connectedIds.has(p.id)).map((p) => ({ id: p.id, name: p.name, slug: p.slug }));
    return { connected, available };
  });

  // Cria a ponte com outro projeto (e religa os containers já no ar via worker).
  app.post('/:id/bridges', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { peerId } = z.object({ peerId: z.string().min(1) }).parse(req.body);
    if (peerId === id) return reply.code(400).send({ error: 'um projeto não faz ponte consigo mesmo' });
    const [a, b] = await Promise.all([
      prisma.project.findFirst({ where: { id, ownerId: req.user.sub } }),
      prisma.project.findFirst({ where: { id: peerId, ownerId: req.user.sub } }),
    ]);
    if (!a || !b) return reply.code(404).send({ error: 'projeto nao encontrado' });
    // Par normalizado (a<b) pra não duplicar a ponte invertida.
    const [aId, bId] = id < peerId ? [id, peerId] : [peerId, id];
    const existing = await prisma.projectBridge.findUnique({ where: { aId_bId: { aId, bId } } });
    if (!existing) await prisma.projectBridge.create({ data: { aId, bId } });
    await bridgeProjects(a.slug, b.slug, true).catch(() => {});
    reply.code(201);
    return { ok: true };
  });

  // Desfaz a ponte (isola de novo) e desconecta os containers via worker.
  app.delete('/:id/bridges/:peerId', async (req, reply) => {
    const { id, peerId } = req.params as { id: string; peerId: string };
    const [a, b] = await Promise.all([
      prisma.project.findFirst({ where: { id, ownerId: req.user.sub } }),
      prisma.project.findFirst({ where: { id: peerId, ownerId: req.user.sub } }),
    ]);
    if (!a || !b) return reply.code(404).send({ error: 'projeto nao encontrado' });
    const [aId, bId] = id < peerId ? [id, peerId] : [peerId, id];
    await prisma.projectBridge.deleteMany({ where: { aId, bId } });
    await bridgeProjects(a.slug, b.slug, false).catch(() => {});
    return { ok: true };
  });

  // Cria um serviço (app ou database) dentro do projeto. Fase 0: só registra o estado.
  app.post('/:id/services', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({
      name: z.string().min(1),
      type: z.enum(['app', 'database']),
      spec: z.record(z.any()).optional(),
    }).parse(req.body);

    const project = await prisma.project.findFirst({ where: { id, ownerId: req.user.sub } });
    if (!project) return reply.code(404).send({ error: 'projeto nao encontrado' });

    const server = await ensureLocalServer();
    reply.code(201);
    return prisma.service.create({
      data: {
        projectId: id,
        serverId: server.id,
        name: slugify(body.name),
        type: body.type,
        spec: body.spec ?? {},
      },
    });
  });
}
