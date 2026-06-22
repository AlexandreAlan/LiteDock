import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';

// Lista todos os domínios dos serviços do usuário (página Domínios, estilo EasyPanel).
export default async function domainRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.get('/', async (req) => {
    return prisma.domain.findMany({
      where: { service: { project: { ownerId: req.user.sub } } },
      include: { service: { include: { project: true } } },
      orderBy: { createdAt: 'desc' },
    });
  });
}
