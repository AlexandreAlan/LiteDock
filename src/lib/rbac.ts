// Checagem de papel (RBAC) reaproveitada em todas as rotas que tocam o host:
// terminal, pm2, tools, devspace e studio. Único ponto de verdade — não
// duplicar essa lógica em cada arquivo de rota.
import type { FastifyReply, FastifyRequest } from 'fastify';

/** owner ou admin — nível "administra o LiteDock" (mesmo padrão usado em users.ts). */
export function requireAdmin(role: string, reply: FastifyReply): boolean {
  if (role !== 'owner' && role !== 'admin') {
    reply.code(403).send({ error: 'sem permissão (apenas owner/admin)' });
    return false;
  }
  return true;
}

/** só owner — nível "acesso irrestrito ao host" (ex.: terminal com shell real). */
export function requireOwner(role: string, reply: FastifyReply): boolean {
  if (role !== 'owner') {
    reply.code(403).send({ error: 'sem permissão (apenas owner)' });
    return false;
  }
  return true;
}

// Variantes em formato de hook Fastify (onRequest), para rotas que preferem
// barrar ANTES do handler rodar — essencial em terminal.ts, que faz upgrade de
// WebSocket e abre um PTY real: se a checagem só rodar dentro do handler, o
// PTY já teria sido criado antes de sermos capazes de recusar a conexão.
export async function requireAdminHook(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  requireAdmin(req.user.role, reply);
}

export async function requireOwnerHook(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  requireOwner(req.user.role, reply);
}
