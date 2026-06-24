import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';

const ROLES = ['owner', 'admin', 'member'] as const;

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
  role: z.enum(ROLES).default('member'),
});

const updateSchema = z.object({
  name: z.string().optional(),
  role: z.enum(ROLES).optional(),
  password: z.string().min(6).optional(),
});

const safe = { id: true, email: true, name: true, role: true, createdAt: true } as const;

export default async function userRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // Só owner/admin administram usuários.
  function requireAdmin(role: string, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) {
    if (role !== 'owner' && role !== 'admin') {
      reply.code(403).send({ error: 'sem permissão (apenas owner/admin)' });
      return false;
    }
    return true;
  }

  app.get('/', async (req, reply) => {
    if (!requireAdmin(req.user.role, reply)) return;
    return prisma.user.findMany({ select: safe, orderBy: { createdAt: 'asc' } });
  });

  app.post('/', async (req, reply) => {
    if (!requireAdmin(req.user.role, reply)) return;
    const body = createSchema.parse(req.body);
    if (await prisma.user.findUnique({ where: { email: body.email } }))
      return reply.code(409).send({ error: 'e-mail já cadastrado' });
    // Só owner pode criar outro owner.
    if (body.role === 'owner' && req.user.role !== 'owner')
      return reply.code(403).send({ error: 'apenas o owner pode criar outro owner' });
    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await prisma.user.create({
      data: { email: body.email, passwordHash, name: body.name, role: body.role },
      select: safe,
    });
    reply.code(201);
    return user;
  });

  app.patch('/:id', async (req, reply) => {
    if (!requireAdmin(req.user.role, reply)) return;
    const { id } = req.params as { id: string };
    const body = updateSchema.parse(req.body);
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return reply.code(404).send({ error: 'usuário não encontrado' });
    // Mexer num owner exige ser owner.
    if (target.role === 'owner' && req.user.role !== 'owner')
      return reply.code(403).send({ error: 'apenas o owner pode alterar o owner' });
    const data: { name?: string; role?: string; passwordHash?: string } = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.role) data.role = body.role;
    if (body.password) data.passwordHash = await bcrypt.hash(body.password, 10);
    return prisma.user.update({ where: { id }, data, select: safe });
  });

  app.delete('/:id', async (req, reply) => {
    if (!requireAdmin(req.user.role, reply)) return;
    const { id } = req.params as { id: string };
    if (id === req.user.sub) return reply.code(400).send({ error: 'você não pode excluir a si mesmo' });
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return reply.code(404).send({ error: 'usuário não encontrado' });
    if (target.role === 'owner') {
      const owners = await prisma.user.count({ where: { role: 'owner' } });
      if (owners <= 1) return reply.code(400).send({ error: 'não dá pra excluir o último owner' });
    }
    await prisma.user.delete({ where: { id } });
    return { ok: true };
  });
}
