import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { encrypt, decrypt } from '../lib/crypto.js';

// Conexão de conta GitHub via Personal Access Token (clássico ou fine-grained).
// O token fica cifrado (AES-256-GCM) no modelo Credential (kind='github').
// Uma conexão por usuário — o deploy de repo privado usa o credentialId dela.

const GH = 'https://api.github.com';

async function gh<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${GH}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'LiteDock',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (res.status === 401) throw new Error('token inválido ou expirado');
  if (!res.ok) throw new Error(`GitHub respondeu ${res.status}`);
  return res.json() as Promise<T>;
}

interface GhUser { login: string; name: string | null; avatar_url: string; html_url: string }
interface GhRepo { full_name: string; private: boolean; default_branch: string; clone_url: string; updated_at: string }

export default async function githubRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  async function myCred(userId: string) {
    return prisma.credential.findFirst({ where: { ownerId: userId, kind: 'github' } });
  }

  // Conecta (ou troca o token de) uma conta GitHub. Valida antes de salvar.
  app.post('/connect', async (req, reply) => {
    const { token } = z.object({ token: z.string().min(8) }).parse(req.body);
    let user: GhUser;
    try {
      user = await gh<GhUser>(token, '/user');
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
    const enc = encrypt(token);
    const existing = await myCred(req.user.sub);
    if (existing) {
      await prisma.credential.update({ where: { id: existing.id }, data: { token: enc, name: user.login } });
    } else {
      await prisma.credential.create({
        data: { ownerId: req.user.sub, kind: 'github', name: user.login, token: enc },
      });
    }
    return { connected: true, login: user.login, name: user.name, avatarUrl: user.avatar_url, htmlUrl: user.html_url };
  });

  // Estado da conexão (revalida o token contra o GitHub).
  app.get('/status', async (req) => {
    const cred = await myCred(req.user.sub);
    if (!cred) return { connected: false };
    try {
      const user = await gh<GhUser>(decrypt(cred.token), '/user');
      return {
        connected: true,
        credentialId: cred.id,
        login: user.login,
        name: user.name,
        avatarUrl: user.avatar_url,
        htmlUrl: user.html_url,
      };
    } catch (e) {
      return { connected: false, invalid: true, error: (e as Error).message, credentialId: cred.id };
    }
  });

  // Lista os repositórios da conta conectada (pra escolher no deploy).
  app.get('/repos', async (req, reply) => {
    const cred = await myCred(req.user.sub);
    if (!cred) return reply.code(404).send({ error: 'nenhuma conta GitHub conectada' });
    try {
      const repos = await gh<GhRepo[]>(
        decrypt(cred.token),
        '/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member',
      );
      return repos.map((r) => ({
        fullName: r.full_name,
        private: r.private,
        defaultBranch: r.default_branch,
        cloneUrl: r.clone_url,
        updatedAt: r.updated_at,
        credentialId: cred.id,
      }));
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  // Desconecta (remove a credencial).
  app.delete('/disconnect', async (req) => {
    const cred = await myCred(req.user.sub);
    if (cred) await prisma.credential.delete({ where: { id: cred.id } });
    return { connected: false };
  });
}
