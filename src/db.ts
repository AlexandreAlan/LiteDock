import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

// Garante que existe o servidor "local" (Docker do proprio host) no banco.
export async function ensureLocalServer() {
  const existing = await prisma.server.findFirst({ where: { name: 'local' } });
  if (existing) return existing;
  return prisma.server.create({
    data: { name: 'local', dockerEndpoint: 'unix:///var/run/docker.sock', status: 'online' },
  });
}
