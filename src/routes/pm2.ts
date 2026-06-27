// Gerenciamento de processos PM2 — lista, start/stop/restart/delete, logs.
import type { FastifyInstance } from 'fastify';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

interface RawProc {
  name: string;
  pm_id: number;
  pid: number;
  monit: { memory: number; cpu: number };
  pm2_env: {
    status: string;
    pm_uptime: number;
    restart_time: number;
    cwd: string;
    pm_exec_path: string;
    pm_out_log_path: string;
    pm_err_log_path: string;
    created_at: number;
  };
}

export interface Pm2Proc {
  id: number;
  name: string;
  pid: number | null;
  status: string;
  cpu: number;
  memory: number;
  uptime: number | null;
  restarts: number;
  cwd: string;
  script: string;
  outLog: string;
  errLog: string;
}

function listProcesses(): Pm2Proc[] {
  try {
    const raw = execSync('pm2 jlist', {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).toString().trim();
    if (!raw) return [];
    // pm2 jlist às vezes prefixa linhas de log — extrair só o array JSON
    const start = raw.indexOf('[');
    if (start < 0) return [];
    const list = JSON.parse(raw.slice(start)) as RawProc[];
    return list.map((p) => ({
      id: p.pm_id,
      name: p.name,
      pid: p.pid || null,
      status: p.pm2_env?.status ?? 'stopped',
      cpu: p.monit?.cpu ?? 0,
      memory: p.monit?.memory ?? 0,
      uptime: p.pm2_env?.pm_uptime || null,
      restarts: p.pm2_env?.restart_time ?? 0,
      cwd: p.pm2_env?.cwd ?? '',
      script: p.pm2_env?.pm_exec_path ?? '',
      outLog: p.pm2_env?.pm_out_log_path ?? '',
      errLog: p.pm2_env?.pm_err_log_path ?? '',
    }));
  } catch {
    return [];
  }
}

function pm2Run(args: string): void {
  execSync(`pm2 ${args}`, { stdio: 'ignore', timeout: 10_000 });
}

function tailFile(path: string, lines: number): string {
  if (!path || !existsSync(path)) return '';
  try {
    return execSync(`tail -n ${lines} ${JSON.stringify(path)}`, {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    }).toString();
  } catch { return ''; }
}

export default async function pm2Routes(app: FastifyInstance) {
  // Listar todos os processos
  app.get('/processes', { onRequest: [app.authenticate] }, async () => ({
    processes: listProcesses(),
  }));

  // Iniciar novo processo
  app.post<{
    Body: { name: string; cmd: string; cwd: string };
  }>('/processes', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { name, cmd, cwd } = req.body;
    if (!name?.trim() || !cmd?.trim() || !cwd?.trim())
      return reply.code(400).send({ error: 'name, cmd e cwd são obrigatórios' });
    if (!existsSync(cwd))
      return reply.code(400).send({ error: `Diretório não encontrado: ${cwd}` });
    try {
      pm2Run(`start ${JSON.stringify(cmd)} --name ${JSON.stringify(name)} --cwd ${JSON.stringify(cwd)}`);
      try { pm2Run('save'); } catch { /* ignora */ }
      return { ok: true };
    } catch (e) {
      return reply.code(500).send({ error: (e as Error).message });
    }
  });

  // Restart
  app.post<{ Params: { name: string } }>(
    '/:name/restart', { onRequest: [app.authenticate] },
    async (req, reply) => {
      try { pm2Run(`restart ${JSON.stringify(req.params.name)}`); return { ok: true }; }
      catch (e) { return reply.code(500).send({ error: (e as Error).message }); }
    },
  );

  // Stop
  app.post<{ Params: { name: string } }>(
    '/:name/stop', { onRequest: [app.authenticate] },
    async (req, reply) => {
      try { pm2Run(`stop ${JSON.stringify(req.params.name)}`); return { ok: true }; }
      catch (e) { return reply.code(500).send({ error: (e as Error).message }); }
    },
  );

  // Start (retoma processo parado)
  app.post<{ Params: { name: string } }>(
    '/:name/start', { onRequest: [app.authenticate] },
    async (req, reply) => {
      try { pm2Run(`start ${JSON.stringify(req.params.name)}`); return { ok: true }; }
      catch (e) { return reply.code(500).send({ error: (e as Error).message }); }
    },
  );

  // Delete (remove do PM2 permanentemente)
  app.delete<{ Params: { name: string } }>(
    '/:name', { onRequest: [app.authenticate] },
    async (req, reply) => {
      try {
        pm2Run(`delete ${JSON.stringify(req.params.name)}`);
        try { pm2Run('save'); } catch { /* ignora */ }
        return { ok: true };
      } catch (e) { return reply.code(500).send({ error: (e as Error).message }); }
    },
  );

  // Logs — últimas N linhas de stdout + stderr
  app.get<{ Params: { name: string }; Querystring: { lines?: string } }>(
    '/:name/logs', { onRequest: [app.authenticate] },
    async (req) => {
      const lines = Math.min(Number(req.query.lines) || 200, 1000);
      const proc = listProcesses().find((p) => p.name === req.params.name);
      if (!proc) return { out: '', err: '' };
      return {
        out: tailFile(proc.outLog, lines),
        err: tailFile(proc.errLog, Math.floor(lines / 2)),
      };
    },
  );
}
