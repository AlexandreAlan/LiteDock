import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';

const credsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
});

export default async function authRoutes(app: FastifyInstance) {
  // Registro só no BOOTSTRAP: o 1º usuario vira 'owner'. Depois fecha — novas
  // contas entram por convite, nunca por cadastro aberto exposto na internet.
  app.post('/register', async (req, reply) => {
    const { email, password, name } = credsSchema.parse(req.body);

    const total = await prisma.user.count();
    if (total > 0)
      return reply.code(403).send({ error: 'Cadastro fechado. Peça um convite ao administrador.' });

    if (await prisma.user.findUnique({ where: { email } }))
      return reply.code(409).send({ error: 'email ja cadastrado' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, passwordHash, name, role: 'owner' },
    });
    const token = app.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    reply.code(201);
    return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
  });

  // Login.
  app.post('/login', async (req, reply) => {
    const { email, password } = credsSchema.pick({ email: true, password: true }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      return reply.code(401).send({ error: 'credenciais invalidas' });
    const token = app.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
  });

  // Usuario logado.
  app.get('/me', { onRequest: [app.authenticate] }, async (req) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
    return { user };
  });
}
