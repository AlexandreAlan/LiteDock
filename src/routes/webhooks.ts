// Webhooks de CI/CD (deploy on-push). Plugin SEM auth JWT — quem chama é o
// GitHub/GitLab, então a autenticação é o token único do serviço (?token=).
// Em caso de match, enfileira o mesmo deploy assíncrono das rotas internas.
import type { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { prisma } from '../db.js';
import * as deploy from '../services/deploy.js';

// Comparação em tempo constante (evita timing attack no token).
function tokenMatches(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export default async function webhookRoutes(app: FastifyInstance) {
  app.post('/services/:id/deploy', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { token } = req.query as { token?: string };
    if (!token) return reply.code(401).send({ error: 'token ausente' });

    const s = await prisma.service.findUnique({ where: { id } });
    if (!s?.deployToken || !tokenMatches(s.deployToken, token)) {
      return reply.code(401).send({ error: 'token inválido' });
    }
    try {
      const { deployment, alreadyRunning } = await deploy.enqueueDeploy(id, 'webhook');
      reply.code(202);
      return { deploymentId: deployment.id, status: deployment.status, alreadyRunning };
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });
}
