import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';

const SESSION_TTL_MS = 4 * 60 * 60 * 1000;
const sessions = new Map<string, number>();

setInterval(() => {
  const now = Date.now();
  for (const [token, exp] of sessions) {
    if (now > exp) sessions.delete(token);
  }
}, 30 * 60 * 1000).unref();

function createSession(): string {
  const token = randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function verifySession(cookieHeader: string): boolean {
  const match = /studio_session=([^;]+)/.exec(cookieHeader);
  const token = match?.[1];
  if (!token) return false;
  const exp = sessions.get(token);
  if (!exp) return false;
  if (Date.now() > exp) { sessions.delete(token); return false; }
  return true;
}

export default async function studioRoutes(app: FastifyInstance) {
  // Forge.tsx chama no mount (Bearer JWT) → cria cookie de sessão.
  // Sem atributo Domain: cookie host-only, só volta em studio.litedock.morenadoaco.com.br.
  // Antes usava Domain=.litedock.morenadoaco.com.br, que também enviava o cookie
  // pros subdomínios de tenant (svc-xxxx.litedock...), permitindo que um tenant
  // capturasse a sessão do Studio passivamente e a reenviasse pra /verify.
  app.post('/session', { onRequest: [app.authenticate] }, async (_req, reply) => {
    const token = createSession();
    reply.header(
      'Set-Cookie',
      `studio_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`,
    );
    return { ok: true };
  });

  // nginx auth_request em studio.litedock chama isso para validar o cookie
  app.get('/verify', async (req, reply) => {
    const cookie = (req.headers.cookie as string | undefined) ?? '';
    if (!verifySession(cookie)) return reply.code(401).send();
    return reply.code(200).send();
  });
}
