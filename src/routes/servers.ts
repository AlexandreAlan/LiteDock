import type { FastifyInstance } from 'fastify';
import { listContainers, engineInfo } from '../services/docker.js';
import { hostMetrics } from '../services/metrics.js';
import { containerStats, dockerEvents, storage } from '../services/monitor.js';

export default async function serverRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

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
}
