import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { requireAdminHook } from '../lib/rbac.js';

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

function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const exp = sessions.get(token);
  if (!exp) return false;
  if (Date.now() > exp) { sessions.delete(token); return false; }
  return true;
}

function verifySession(cookieHeader: string): boolean {
  const match = /studio_session=([^;]+)/.exec(cookieHeader);
  return verifySessionToken(match?.[1]);
}

export default async function studioRoutes(app: FastifyInstance) {
  // Forge.tsx chama no mount (Bearer JWT) → cria cookie de sessão.
  // Sem atributo Domain: cookie host-only, só volta em litedock.morenadoaco.com.br
  // (mesmo host do painel, porta 8443 — ver nginx/sites-available/litedock-ide.conf;
  // cookies não consideram porta por RFC 6265, então o cookie plantado aqui já
  // vale lá, sem precisar de nenhuma ponte entre domínios). Antes usava
  // Domain=.litedock.morenadoaco.com.br, que também enviava o cookie pros
  // subdomínios de TENANT (svc-xxxx.litedock...), permitindo que um tenant
  // capturasse a sessão do Studio passivamente e a reenviasse pra /verify.
  // Studio dá acesso ao code-server (IDE completo) — restrito a owner/admin.
  app.post('/session', { onRequest: [app.authenticate, requireAdminHook] }, async (_req, reply) => {
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
