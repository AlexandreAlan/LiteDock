import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';

export default async function activityRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // Lista os últimos deployments de todos os serviços do usuário.
  app.get('/', async (req) => {
    const { take: rawTake, skip: rawSkip } = z
      .object({ take: z.coerce.number().min(1).max(100).default(50), skip: z.coerce.number().min(0).default(0) })
      .parse(req.query);

    const deployments = await prisma.deployment.findMany({
      where: { service: { project: { ownerId: req.user.sub } } },
      include: {
        service: { select: { id: true, name: true, project: { select: { id: true, name: true } } } },
      },
      orderBy: { startedAt: 'desc' },
      take: rawTake,
      skip: rawSkip,
    });

    const total = await prisma.deployment.count({
      where: { service: { project: { ownerId: req.user.sub } } },
    });

    return { deployments, total };
  });

  // Stats rápidas: total de deploys, sucessos, falhas, hoje.
  app.get('/stats', async (req) => {
    const ownerId = req.user.sub;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [total, successes, failures, today] = await Promise.all([
      prisma.deployment.count({ where: { service: { project: { ownerId } } } }),
      prisma.deployment.count({ where: { service: { project: { ownerId } }, status: 'success' } }),
      prisma.deployment.count({ where: { service: { project: { ownerId } }, status: 'failed' } }),
      prisma.deployment.count({ where: { service: { project: { ownerId } }, startedAt: { gte: todayStart } } }),
    ]);

    return { total, successes, failures, today };
  });
}
