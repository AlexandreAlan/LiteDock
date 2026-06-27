// Ferramentas de dev/infra: port map, env manager, cron jobs, disk usage.
import type { FastifyInstance } from 'fastify';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

// ─── Port Map ──────────────────────────────────────────────────────────────────

interface PortEntry {
  port: number;
  proto: 'tcp' | 'udp';
  pid: number | null;
  process: string | null;
  state: string;
  addr: string;
}

function parsePortMap(): PortEntry[] {
  try {
    const raw = execSync('/bin/sh -c "ss -tlnpu 2>/dev/null || netstat -tlnpu 2>/dev/null"', {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).toString();

    const entries: PortEntry[] = [];
    const seen = new Set<string>();

    for (const line of raw.split('\n').slice(1)) {
      // formato ss: Netid State Recv-Q Send-Q Local-Address:Port Peer-Address:Port
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5) continue;
      const proto = parts[0]?.toLowerCase();
      if (proto !== 'tcp' && proto !== 'udp') continue;

      const localAddr = parts[4] ?? '';
      const colonIdx = localAddr.lastIndexOf(':');
      if (colonIdx < 0) continue;
      const addr = localAddr.slice(0, colonIdx);
      const port = parseInt(localAddr.slice(colonIdx + 1), 10);
      if (isNaN(port) || port <= 0) continue;

      // extrair pid/process do campo users
      const userField = parts[6] ?? '';
      let pid: number | null = null;
      let proc: string | null = null;
      const pidMatch = userField.match(/pid=(\d+)/);
      const procMatch = userField.match(/\("([^"]+)"/);
      if (pidMatch) pid = parseInt(pidMatch[1], 10);
      if (procMatch) proc = procMatch[1];

      const state = proto === 'tcp' ? (parts[1] ?? '') : 'UNCONN';
      const key = `${proto}:${port}`;
      if (seen.has(key)) continue;
      seen.add(key);

      entries.push({ port, proto: proto as 'tcp' | 'udp', pid, process: proc, state, addr });
    }

    return entries.sort((a, b) => a.port - b.port);
  } catch { return []; }
}

// ─── Env Manager ───────────────────────────────────────────────────────────────

function resolveEnvPath(rawPath: string): string {
  const safe = resolve('/', rawPath).replace(/\/$/, '');
  // só permite ler/editar dentro de /var/www
  if (!safe.startsWith('/var/www/')) throw new Error('Caminho fora de /var/www');
  return safe;
}

function parseEnv(content: string): Array<{ key: string; value: string; comment: boolean }> {
  return content.split('\n').map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#'))
      return { key: '', value: trimmed, comment: true };
    const eq = trimmed.indexOf('=');
    if (eq < 0) return { key: trimmed, value: '', comment: false };
    return { key: trimmed.slice(0, eq), value: trimmed.slice(eq + 1), comment: false };
  });
}

function serializeEnv(entries: Array<{ key: string; value: string; comment: boolean }>): string {
  return entries
    .map((e) => (e.comment ? e.value : `${e.key}=${e.value}`))
    .join('\n');
}

// ─── Disk Usage ────────────────────────────────────────────────────────────────

interface DiskEntry { path: string; size: string; bytes: number }

function diskUsage(dir: string): DiskEntry[] {
  const safe = resolve('/', dir).replace(/\/$/, '');
  if (!safe.startsWith('/var/www/') && safe !== '/var/www') throw new Error('Fora de /var/www');
  try {
    const raw = execSync(`/bin/sh -c "du -sh ${JSON.stringify(safe)}/*/  2>/dev/null | sort -rh | head -30"`, {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 15_000,
    }).toString();

    return raw.trim().split('\n').filter(Boolean).map((line) => {
      const [size, ...rest] = line.split('\t');
      const path = rest.join('\t').trim();
      // converter size para bytes aproximado para ordenação
      const m = size?.match(/^([\d.]+)([KMGT]?)$/);
      let bytes = 0;
      if (m) {
        const n = parseFloat(m[1]);
        const u = m[2];
        bytes = u === 'G' ? n * 1e9 : u === 'M' ? n * 1e6 : u === 'K' ? n * 1e3 : n;
      }
      return { path, size: size ?? '?', bytes };
    });
  } catch { return []; }
}

// ─── Cron Jobs ─────────────────────────────────────────────────────────────────

interface CronEntry { raw: string; schedule: string; command: string; user?: string }

function listCrons(): CronEntry[] {
  const entries: CronEntry[] = [];

  // crontab do usuário atual
  try {
    const raw = execSync('crontab -l 2>/dev/null', {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    }).toString();
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const parts = t.split(/\s+/);
      if (parts.length < 6) continue;
      entries.push({ raw: t, schedule: parts.slice(0, 5).join(' '), command: parts.slice(5).join(' ') });
    }
  } catch { /* sem crontab */ }

  // /etc/cron.d/*
  try {
    const files = execSync('ls /etc/cron.d/ 2>/dev/null', {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    }).toString().trim().split('\n').filter(Boolean);

    for (const f of files) {
      try {
        const content = readFileSync(`/etc/cron.d/${f}`, 'utf8');
        for (const line of content.split('\n')) {
          const t = line.trim();
          if (!t || t.startsWith('#') || t.startsWith('MAILTO') || t.startsWith('PATH')) continue;
          const parts = t.split(/\s+/);
          if (parts.length < 7) continue;
          entries.push({
            raw: t,
            schedule: parts.slice(0, 5).join(' '),
            user: parts[5],
            command: parts.slice(6).join(' '),
          });
        }
      } catch { /* ignora */ }
    }
  } catch { /* ignora */ }

  return entries;
}

// ─── Routes ────────────────────────────────────────────────────────────────────

export default async function toolsRoutes(app: FastifyInstance) {
  // GET /tools/ports — mapeamento de portas em uso
  app.get('/ports', { onRequest: [app.authenticate] }, async () => ({
    ports: parsePortMap(),
  }));

  // GET /tools/disk?dir=/var/www — uso de disco por subdiretório
  app.get<{ Querystring: { dir?: string } }>(
    '/disk', { onRequest: [app.authenticate] },
    async (req, reply) => {
      const dir = req.query.dir || '/var/www';
      try {
        return { entries: diskUsage(dir) };
      } catch (e) {
        return reply.code(400).send({ error: (e as Error).message });
      }
    },
  );

  // GET /tools/crons — lista cron jobs do sistema
  app.get('/crons', { onRequest: [app.authenticate] }, async () => ({
    crons: listCrons(),
  }));

  // GET /tools/env?path=/var/www/foo — lê .env (valores de senhas mascarados)
  app.get<{ Querystring: { path?: string } }>(
    '/env', { onRequest: [app.authenticate] },
    async (req, reply) => {
      if (!req.query.path) return reply.code(400).send({ error: 'path obrigatório' });
      try {
        const dir = resolveEnvPath(req.query.path);
        const envPath = existsSync(`${dir}/.env`) ? `${dir}/.env` : `${dir}`;
        if (!existsSync(envPath)) return reply.code(404).send({ error: '.env não encontrado' });
        const raw = readFileSync(envPath, 'utf8');
        const entries = parseEnv(raw);
        // mascara valores que pareçam segredos (chaves com SECRET, KEY, PASS, TOKEN)
        const masked = entries.map((e) => ({
          ...e,
          masked: !e.comment && /SECRET|KEY|PASS|TOKEN|PWD|DATABASE_URL/i.test(e.key),
        }));
        return { entries: masked };
      } catch (e) {
        return reply.code(400).send({ error: (e as Error).message });
      }
    },
  );

  // PUT /tools/env — salva .env (requer path no body para segurança)
  app.put<{
    Body: { path: string; entries: Array<{ key: string; value: string; comment: boolean }> };
  }>('/env', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { path: rawPath, entries } = req.body;
    if (!rawPath || !Array.isArray(entries))
      return reply.code(400).send({ error: 'path e entries são obrigatórios' });
    try {
      const dir = resolveEnvPath(rawPath);
      const envPath = dir.endsWith('.env') ? dir : `${dir}/.env`;
      // garante que o diretório pai existe
      if (!existsSync(dirname(envPath)))
        return reply.code(400).send({ error: 'Diretório não encontrado' });
      const content = serializeEnv(entries);
      writeFileSync(envPath, content, { mode: 0o600 });
      return { ok: true };
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  // GET /tools/processes/search?q=node — busca por nome de processo no sistema
  app.get<{ Querystring: { q?: string } }>(
    '/processes/search', { onRequest: [app.authenticate] },
    async (req) => {
      const q = (req.query.q ?? '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 40);
      if (!q) return { results: [] };
      try {
        const raw = execSync(`/bin/sh -c "ps aux --no-headers 2>/dev/null | grep -i ${JSON.stringify(q)} | grep -v grep | head -20"`, {
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 5000,
        }).toString();
        const results = raw.trim().split('\n').filter(Boolean).map((line) => {
          const cols = line.trim().split(/\s+/);
          return {
            user: cols[0],
            pid: cols[1],
            cpu: cols[2],
            mem: cols[3],
            cmd: cols.slice(10).join(' '),
          };
        });
        return { results };
      } catch { return { results: [] }; }
    },
  );
}
