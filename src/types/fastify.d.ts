import 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
  }
}

// Payload do JWT.
// `tv` (tokenVersion) é o valor de User.tokenVersion no momento em que o token
// foi emitido — o decorator `authenticate` compara com o valor atual no banco
// pra permitir revogação (troca de senha, "sair de todos os dispositivos")
// mesmo antes do token expirar.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; email: string; role: string; tv: number };
    user: { sub: string; email: string; role: string; tv: number };
  }
}
