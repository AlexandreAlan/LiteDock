import type { FastifyInstance } from 'fastify';
import { listContainers, engineInfo } from '../services/docker.js';

export default async function serverRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // Ping da Docker Engine (versao).
  app.get('/local/engine', async () => engineInfo());

  // Visao da VPS: containers do host.
  app.get('/local/containers', async () => listContainers());
}
