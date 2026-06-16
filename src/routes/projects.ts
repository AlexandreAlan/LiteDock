import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, ensureLocalServer } from '../db.js';

const slugify = (s: string) =>
  s.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

export default async function projectRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // Lista os projetos do usuario.
  app.get('/', async (req) => {
    return prisma.project.findMany({
      where: { ownerId: req.user.sub },
      include: { services: true },
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

  // Remove um projeto (e seus serviços, em cascata no banco).
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = await prisma.project.findFirst({ where: { id, ownerId: req.user.sub } });
    if (!project) return reply.code(404).send({ error: 'projeto nao encontrado' });
    await prisma.project.delete({ where: { id } });
    return { removed: id };
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
