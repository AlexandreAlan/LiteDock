import type { FastifyInstance, FastifyRequest } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { generateSecret, verifyTotp, otpauthUrl } from '../lib/totp.js';

// Rate limiter simples em memória: máx. 10 tentativas por IP por minuto.
const attempts = new Map<string, { count: number; resetAt: number }>();
function rateLimit(req: FastifyRequest, reply: any): boolean {
  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim()
    ?? req.socket.remoteAddress ?? 'unknown';
  const now = Date.now();
  const bucket = attempts.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  bucket.count++;
  if (bucket.count > 10) {
    const retry = Math.ceil((bucket.resetAt - now) / 1000);
    reply.code(429).send({ error: `Muitas tentativas. Tente novamente em ${retry}s.` });
    return true;
  }
  return false;
}

const credsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
});

const updateCredsSchema = z.object({
  email: z.string().email().optional(),
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6).optional(),
});

export default async function authRoutes(app: FastifyInstance) {
  // Registro só no BOOTSTRAP: o 1º usuario vira 'owner'. Depois fecha — novas
  // contas entram por convite, nunca por cadastro aberto exposto na internet.
  app.post('/register', async (req, reply) => {
    const { email, password, name } = credsSchema.parse(req.body);

    const total = await prisma.user.count();
    if (total > 0)
      return reply.code(403).send({ error: 'Cadastro fechado. Peça um convite ao administrador.' });

    if (await prisma.user.findUnique({ where: { email } }))
      return reply.code(409).send({ error: 'email ja cadastrado' });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash, name, role: 'owner' },
    });
    const token = app.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    reply.code(201);
    return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
  });

  // Login. Se a conta tiver 2FA ligado, exige o código TOTP de 6 dígitos.
  app.post('/login', async (req, reply) => {
    if (rateLimit(req, reply)) return;
    const { email, password, code } = z
      .object({ email: z.string().email(), password: z.string().min(1), code: z.string().optional() })
      .parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      return reply.code(401).send({ error: 'credenciais invalidas' });
    if (user.totpEnabled && user.totpSecret) {
      if (!code) return reply.code(401).send({ error: '2fa_required', twoFactor: true });
      if (!verifyTotp(user.totpSecret, code))
        return reply.code(401).send({ error: 'código de verificação inválido', twoFactor: true });
    }
    const token = app.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    return {
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, totpEnabled: user.totpEnabled },
    };
  });

  // Usuario logado.
  app.get('/me', { onRequest: [app.authenticate] }, async (req) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { id: true, email: true, name: true, role: true, totpEnabled: true, createdAt: true },
    });
    return { user };
  });

  // ── 2FA (TOTP) ──────────────────────────────────────────────────────────
  // 1) Gera (ou regera) um segredo e devolve o otpauth:// pra montar o QR.
  //    Ainda NÃO liga o 2FA — só depois de confirmar um código válido.
  app.post('/2fa/setup', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user) return reply.code(404).send({ error: 'usuário não encontrado' });
    if (user.totpEnabled) return reply.code(409).send({ error: '2FA já está ativo' });
    const secret = generateSecret();
    await prisma.user.update({ where: { id: user.id }, data: { totpSecret: secret } });
    return { secret, otpauthUrl: otpauthUrl(secret, user.email) };
  });

  // 2) Confirma o código do app autenticador e liga o 2FA.
  app.post('/2fa/enable', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { code } = z.object({ code: z.string().min(6) }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user?.totpSecret) return reply.code(400).send({ error: 'gere o segredo primeiro' });
    if (!verifyTotp(user.totpSecret, code))
      return reply.code(400).send({ error: 'código inválido — confira o relógio e tente de novo' });
    await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
    return { ok: true, totpEnabled: true };
  });

  // 3) Desliga o 2FA (exige a senha pra confirmar identidade).
  app.post('/2fa/disable', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { password } = z.object({ password: z.string().min(1) }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user) return reply.code(404).send({ error: 'usuário não encontrado' });
    if (!(await bcrypt.compare(password, user.passwordHash)))
      return reply.code(403).send({ error: 'senha incorreta' });
    await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: null } });
    return { ok: true, totpEnabled: false };
  });

  // Mudar credenciais (e-mail e/ou senha) da conta logada. Exige a senha atual.
  // Devolve um JWT novo, já que o payload (e-mail) pode ter mudado.
  app.patch('/credentials', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { email, currentPassword, newPassword } = updateCredsSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user) return reply.code(404).send({ error: 'usuário não encontrado' });

    if (!(await bcrypt.compare(currentPassword, user.passwordHash)))
      return reply.code(403).send({ error: 'senha atual incorreta' });

    const data: { email?: string; passwordHash?: string } = {};
    if (email && email !== user.email) {
      const exists = await prisma.user.findUnique({ where: { email } });
      if (exists && exists.id !== user.id)
        return reply.code(409).send({ error: 'e-mail já cadastrado' });
      data.email = email;
    }
    if (newPassword) data.passwordHash = await bcrypt.hash(newPassword, 12);

    if (!data.email && !data.passwordHash)
      return reply.code(400).send({ error: 'nada para alterar' });

    const updated = await prisma.user.update({ where: { id: user.id }, data });
    const token = app.jwt.sign({ sub: updated.id, email: updated.email, role: updated.role });
    return { token, user: { id: updated.id, email: updated.email, name: updated.name, role: updated.role } };
  });
}
