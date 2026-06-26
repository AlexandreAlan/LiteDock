import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';

async function sendTestWebhook(webhookUrl: string): Promise<void> {
  const isSlack = webhookUrl.includes('hooks.slack.com');
  const text = '✅ LiteDock — webhook de notificações configurado com sucesso!';
  const body = isSlack ? JSON.stringify({ text }) : JSON.stringify({ content: text });
  const res = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  if (!res.ok) throw new Error(`Webhook retornou ${res.status}`);
}

// Configurações gerais do painel, guardadas como chave-valor. Só chaves
// conhecidas são aceitas — evita virar lixeira de dados arbitrários.
const KEYS = [
  'panelCustomDomain', // domínio personalizado do painel
  'panelServeOnIp', // 'true' | 'false' — servir direto no IP
  'serviceCustomDomain', // domínio curinga p/ novos serviços
  'letsEncryptEmail', // e-mail dos certificados SSL
  'dailyDockerCleanup', // 'true' | 'false' — limpeza diária do Docker
  'brandName', // nome exibido no painel (marca)
  'brandLogoUrl', // URL do logo da marca
  'notifyEmail', // e-mail para notificações
  'notifyWebhook', // webhook (Discord/Slack) para notificações
  'notifyOnDeploy', // 'true' | 'false' — avisar em deploys
] as const;

type Key = (typeof KEYS)[number];

const patchSchema = z
  .object(Object.fromEntries(KEYS.map((k) => [k, z.string().optional()])) as Record<Key, z.ZodOptional<z.ZodString>>)
  .strict();

export default async function settingsRoutes(app: FastifyInstance) {
  // Todas as configs (objeto chave→valor). Chaves não definidas vêm ausentes.
  app.get('/', { onRequest: [app.authenticate] }, async () => {
    const rows = await prisma.setting.findMany({ where: { key: { in: [...KEYS] } } });
    const out: Record<string, string> = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
  });

  // Envia uma mensagem de teste para o webhook configurado.
  app.post('/test-webhook', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { url } = z.object({ url: z.string().url() }).parse(req.body);
    try {
      await sendTestWebhook(url);
      return { ok: true };
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  // Upsert parcial: grava só as chaves enviadas.
  app.patch('/', { onRequest: [app.authenticate] }, async (req) => {
    const body = patchSchema.parse(req.body);
    const entries = Object.entries(body).filter(([, v]) => v !== undefined) as [Key, string][];
    await prisma.$transaction(
      entries.map(([key, value]) =>
        prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } }),
      ),
    );
    const rows = await prisma.setting.findMany({ where: { key: { in: [...KEYS] } } });
    const out: Record<string, string> = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
  });
}
