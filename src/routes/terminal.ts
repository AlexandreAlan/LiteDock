// Terminal WebSocket — PTY real rodando bash no servidor.
// Cada conexão autenticada ganha um PTY isolado. O frontend usa xterm.js.
import type { FastifyInstance } from 'fastify';
import * as pty from 'node-pty';
import os from 'node:os';
import { requireOwnerHook } from '../lib/rbac.js';

export default async function terminalRoutes(app: FastifyInstance) {
  await app.register(import('@fastify/websocket'));

  // Shell real do host — só o owner pode abrir. requireOwnerHook roda como
  // onRequest (antes do upgrade do WebSocket e antes do PTY ser criado), então
  // uma negativa nunca chega a spawnar bash: @fastify/websocket só faz o
  // upgrade/hijack se a reply ainda não tiver sido enviada pelos hooks.
  app.get('/ws', { websocket: true, onRequest: [app.authenticate, requireOwnerHook] }, (socket) => {
    const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';

    const term = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 220,
      rows: 50,
      cwd: process.env.HOME || '/home/alexandrealan',
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        HOME: process.env.HOME || '/home/alexandrealan',
        COLORTERM: 'truecolor',
      },
    });

    term.onData((data) => {
      try { socket.send(JSON.stringify({ type: 'output', data })); } catch { /* fechou */ }
    });

    term.onExit(() => {
      try { socket.send(JSON.stringify({ type: 'exit' })); socket.close(); } catch { /* ok */ }
    });

    socket.on('message', (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type: string; data?: string; cols?: number; rows?: number };
        if (msg.type === 'input' && msg.data) term.write(msg.data);
        if (msg.type === 'resize' && msg.cols && msg.rows) term.resize(msg.cols, msg.rows);
      } catch { /* ignora frame inválido */ }
    });

    socket.on('close', () => {
      try { term.kill(); } catch { /* já morto */ }
    });
  });
}
