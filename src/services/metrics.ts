// Métricas do host (a API roda no host via pm2, então /proc reflete a VPS real).
import os from 'node:os';
import { readFile, statfs } from 'node:fs/promises';

let lastNet: { rx: number; tx: number; t: number } | null = null;

// IP público: resolvido uma vez e cacheado pra vida do processo.
let publicIp: string | null = null;
let publicIpTried = false;

// Primeiro IPv4 não-interno das interfaces (fallback offline).
function localIp(): string {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces ?? []) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return '127.0.0.1';
}

async function resolvePublicIp(): Promise<string> {
  if (publicIp) return publicIp;
  if (!publicIpTried) {
    publicIpTried = true;
    try {
      const ctrl = AbortController ? new AbortController() : null;
      const t = ctrl ? setTimeout(() => ctrl.abort(), 1500) : null;
      const res = await fetch('https://api.ipify.org', { signal: ctrl?.signal });
      if (t) clearTimeout(t);
      const ip = (await res.text()).trim();
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) publicIp = ip;
    } catch { /* offline: usa o IP local */ }
  }
  return publicIp ?? localIp();
}

async function readCpu() {
  const data = await readFile('/proc/stat', 'utf8');
  const parts = data.split('\n')[0].trim().split(/\s+/).slice(1).map(Number);
  const idle = parts[3] + (parts[4] || 0); // idle + iowait
  const total = parts.reduce((a, b) => a + b, 0);
  return { idle, total };
}

async function readNet() {
  const data = await readFile('/proc/net/dev', 'utf8');
  let rx = 0, tx = 0;
  for (const line of data.split('\n')) {
    const m = line.match(/^\s*([\w-]+):\s*(.*)$/);
    if (!m || m[1] === 'lo') continue;
    const cols = m[2].trim().split(/\s+/).map(Number);
    rx += cols[0] || 0; // bytes recebidos
    tx += cols[8] || 0; // bytes transmitidos
  }
  return { rx, tx };
}

async function readMem() {
  const data = await readFile('/proc/meminfo', 'utf8');
  const get = (k: string) => {
    const m = data.match(new RegExp(`^${k}:\\s+(\\d+)`, 'm'));
    return m ? Number(m[1]) * 1024 : 0;
  };
  const total = get('MemTotal');
  const avail = get('MemAvailable');
  return { total, used: total - avail };
}

export async function hostMetrics() {
  // CPU%: dois reads de /proc/stat com 200ms de intervalo.
  const c1 = await readCpu();
  await new Promise((r) => setTimeout(r, 200));
  const c2 = await readCpu();
  const dTotal = c2.total - c1.total;
  const dIdle = c2.idle - c1.idle;
  const cpuPct = dTotal > 0 ? Math.max(0, Math.min(100, (1 - dIdle / dTotal) * 100)) : 0;

  const mem = await readMem();

  let diskUsed = 0, diskTotal = 0;
  try {
    const sf = await statfs('/');
    diskTotal = Number(sf.blocks) * sf.bsize;
    diskUsed = diskTotal - Number(sf.bavail) * sf.bsize;
  } catch { /* ignore */ }

  const net = await readNet();
  const now = Date.now();
  let inBps = 0, outBps = 0;
  if (lastNet) {
    const dt = (now - lastNet.t) / 1000;
    if (dt > 0) {
      inBps = Math.max(0, (net.rx - lastNet.rx) / dt);
      outBps = Math.max(0, (net.tx - lastNet.tx) / dt);
    }
  }
  lastNet = { rx: net.rx, tx: net.tx, t: now };

  return {
    hostname: os.hostname(),
    publicIp: await resolvePublicIp(),
    uptimeSec: Math.round(os.uptime()),
    cpu: { pct: +cpuPct.toFixed(1), cores: os.cpus().length, load: os.loadavg().map((n) => +n.toFixed(2)) },
    memory: { usedBytes: mem.used, totalBytes: mem.total, pct: mem.total ? +((mem.used / mem.total) * 100).toFixed(1) : 0 },
    disk: { usedBytes: diskUsed, totalBytes: diskTotal, pct: diskTotal ? +((diskUsed / diskTotal) * 100).toFixed(1) : 0 },
    network: { inBps: Math.round(inBps), outBps: Math.round(outBps) },
  };
}
