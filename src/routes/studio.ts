import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';

export default async function studioRoutes(app: FastifyInstance) {
  // Retorna a URL acessível do workspace Forge. O valor vem da Setting `studioUrl`
  // (configurável em Ajustes). available=false quando ainda não configurado.
  app.get('/url', { onRequest: [app.authenticate] }, async () => {
    const s = await prisma.setting.findUnique({ where: { key: 'studioUrl' } });
    const url = s?.value?.trim() ?? '';
    return { url, available: !!url };
  });
}
