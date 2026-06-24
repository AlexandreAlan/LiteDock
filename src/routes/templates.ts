import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, ensureLocalServer } from '../db.js';
import { encrypt } from '../lib/crypto.js';
import {
  CATEGORIES,
  listTemplates,
  getTemplate,
  genSecret,
  interpolate,
} from '../services/templates.js';
import { enqueueDeploy } from '../services/deploy.js';

const slugify = (s: string) =>
  s.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

// Heurística: env sensível vira segredo (cifrado em repouso).
const looksSecret = (key: string) => /pass|secret|token|key|root/i.test(key);

export default async function templateRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // Loja: catálogo + categorias.
  app.get('/', async () => ({ categories: CATEGORIES, templates: listTemplates() }));

  // Detalhe de um template (mostra o que será criado).
  app.get('/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const t = getTemplate(slug);
    if (!t) return reply.code(404).send({ error: 'template não encontrado' });
    return t;
  });

  // Instala um template num projeto: cria os serviços + env (com segredos gerados).
  // Modo seguro: só registra o estado (status "created"); o deploy real é separado.
  app.post('/:slug/install', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const body = z.object({ projectId: z.string().min(1), name: z.string().optional() }).parse(req.body);

    const tpl = getTemplate(slug);
    if (!tpl) return reply.code(404).send({ error: 'template não encontrado' });

    const project = await prisma.project.findFirst({
      where: { id: body.projectId, ownerId: req.user.sub },
    });
    if (!project) return reply.code(404).send({ error: 'projeto não encontrado' });

    const base = slugify(body.name || tpl.slug);
    const multi = tpl.services.length > 1;
    const nameFor = (s: { name: string }) => (multi ? `${base}-${s.name}` : base);

    // Colisão de nome dentro do projeto?
    for (const s of tpl.services) {
      const finalName = nameFor(s);
      const dup = await prisma.service.findFirst({ where: { projectId: project.id, name: finalName } });
      if (dup) return reply.code(409).send({ error: `o serviço "${finalName}" já existe neste projeto` });
    }

    // Gera as variáveis (senhas fortes) uma vez por instalação.
    const vars: Record<string, string> = {};
    for (const v of tpl.variables ?? []) vars[v] = genSecret();

    const server = await ensureLocalServer();
    const created = [];

    for (const s of tpl.services) {
      const finalName = nameFor(s);
      const service = await prisma.service.create({
        data: {
          projectId: project.id,
          serverId: server.id,
          name: finalName,
          type: s.type,
          spec: {
            template: tpl.slug,
            role: s.name,
            image: s.image,
            ports: s.ports ?? [],
            volumes: s.volumes ?? [],
          },
        },
      });

      // Env vars com interpolação de ${slug}/${VAR}.
      for (const [key, raw] of Object.entries(s.env ?? {})) {
        const value = interpolate(raw, base, vars);
        const secret = looksSecret(key);
        await prisma.envVar.create({
          data: {
            serviceId: service.id,
            key,
            value: secret ? encrypt(value) : value,
            isSecret: secret,
          },
        });
      }
      created.push({ id: service.id, name: service.name, type: service.type });
    }

    // Auto-deploy: sobe tudo já. Banco primeiro (o app depende dele); o app
    // entra logo depois (RestartPolicy + blue-green toleram o banco subindo).
    const dbs = created.filter((s) => s.type === 'database');
    const apps = created.filter((s) => s.type === 'app');
    for (const s of dbs) await enqueueDeploy(s.id, 'api').catch(() => {});
    for (const s of apps) {
      setTimeout(() => { enqueueDeploy(s.id, 'api').catch(() => {}); }, dbs.length ? 6000 : 0);
    }

    reply.code(201);
    return { installed: tpl.slug, base, services: created };
  });
}
