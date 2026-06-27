// Terminal xterm.js conectado ao PTY real do servidor via WebSocket autenticado.
import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

interface Props { token: string; }

export function Terminal({ token }: Props) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!el.current) return;

    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#58a6ff',
        black: '#484f58', red: '#ff7b72', green: '#3fb950', yellow: '#d29922',
        blue: '#58a6ff', magenta: '#bc8cff', cyan: '#39c5cf', white: '#b1bac4',
        brightBlack: '#6e7681', brightRed: '#ffa198', brightGreen: '#56d364',
        brightYellow: '#e3b341', brightBlue: '#79c0ff', brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd', brightWhite: '#f0f6fc',
        selectionBackground: '#264f78',
      },
      allowTransparency: false,
      scrollback: 5000,
    });

    const fit = new FitAddon();
    const links = new WebLinksAddon();
    term.loadAddon(fit);
    term.loadAddon(links);
    term.open(el.current);
    fit.fit();

    // WebSocket — passa o token JWT como query param (única forma com WS)
    const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
    const wsHost = location.host;
    const ws = new WebSocket(`${wsProto}://${wsHost}/api/terminal/ws?token=${token}`);

    ws.onopen = () => {
      // Resize inicial
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data as string) as { type: string; data?: string };
      if (msg.type === 'output' && msg.data) term.write(msg.data);
      if (msg.type === 'exit') term.write('\r\n\x1b[31m[sessão encerrada]\x1b[0m\r\n');
    };
    ws.onclose = () => { /* sessão encerrada — sem mensagem visível */ };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data }));
    });

    // Recebe comandos dos botões "Comandos rápidos" do Forge
    const onCmd = (e: Event) => {
      const cmd = (e as CustomEvent<string>).detail;
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data: cmd }));
    };
    window.addEventListener('forge:terminal-cmd', onCmd);

    const ro = new ResizeObserver(() => {
      try { fit.fit(); ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows })); }
      catch { /* ws fechou */ }
    });
    ro.observe(el.current);

    return () => {
      window.removeEventListener('forge:terminal-cmd', onCmd);
      ro.disconnect();
      ws.close();
      term.dispose();
    };
  }, [token]);

  return <div ref={el} className="h-full w-full overflow-hidden" />;
}
