// Engine de deploy: orquestra o ciclo de vida de um serviço via Docker.
// Fase 1: deploy por IMAGEM. Cria o container na rede do Traefik com os labels
// de roteamento. Não publica porta no host (Traefik faz a ponte).
import { docker } from './docker.js';
import { prisma } from '../db.js';
import { decrypt } from '../lib/crypto.js';
import { traefikLabels } from './traefik.js';
import { config } from '../config.js';

const NETWORK = config.traefikNetwork;

type LogFn = (line: string) => void;

// Garante a rede compartilhada com o Traefik.
export async function ensureNetwork() {
  const nets = await docker.listNetworks();
  if (!nets.find((n) => n.Name === NETWORK)) {
    await docker.createNetwork({ Name: NETWORK, Driver: 'bridge' });
  }
}

export function containerName(projectSlug: string, serviceName: string) {
  return `litedock-${projectSlug}-${serviceName}`;
}

function pullImage(image: string, onLog: LogFn) {
  return new Promise<void>((resolve, reject) => {
    docker.pull(image, (err: unknown, stream: NodeJS.ReadableStream) => {
      if (err) return reject(err);
      docker.modem.followProgress(
        stream,
        (e: Error | null) => (e ? reject(e) : resolve()),
        (ev: { status?: string; progress?: string }) => {
          if (ev.status) onLog(`${ev.status}${ev.progress ? ' ' + ev.progress : ''}`);
        },
      );
    });
  });
}

// Deploy completo de um serviço do tipo 'app' a partir de uma imagem.
export async function deployService(serviceId: string, onLog: LogFn = () => {}) {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    include: { project: true, envVars: true, domains: true },
  });
  if (!service) throw new Error('serviço não encontrado');
  if (service.type !== 'app') throw new Error('deploy automático só para apps por enquanto');

  const spec = (service.spec ?? {}) as { image?: string; port?: number };
  if (!spec.image) throw new Error('spec.image é obrigatório (Fase 1 = deploy por imagem)');
  const image = spec.image;
  const port = Number(spec.port || 80);

  const dep = await prisma.deployment.create({
    data: { serviceId, status: 'building', trigger: 'manual', imageTag: image },
  });
  const logs: string[] = [];
  const log = (l: string) => { logs.push(l); onLog(l); };

  try {
    await ensureNetwork();
    await prisma.service.update({ where: { id: serviceId }, data: { status: 'deploying' } });

    log(`Baixando imagem ${image} ...`);
    await pullImage(image, log);

    const name = containerName(service.project.slug, service.name);
    try {
      const old = docker.getContainer(name);
      await old.remove({ force: true });
      log('Container antigo removido');
    } catch { /* não existia */ }

    const env = service.envVars.map((e) => `${e.key}=${e.isSecret ? decrypt(e.value) : e.value}`);
    const hosts = service.domains.map((d) => d.host);
    const tls = service.domains.some((d) => d.https);
    const labels = traefikLabels({ serviceId, routerName: name, hosts, port, tls });

    log('Criando container ...');
    const container = await docker.createContainer({
      name,
      Image: image,
      Env: env,
      Labels: labels,
      HostConfig: {
        RestartPolicy: { Name: 'unless-stopped' },
        NetworkMode: NETWORK,
      },
    });
    await container.start();
    log('Container iniciado ✓');

    await prisma.service.update({
      where: { id: serviceId },
      data: { status: 'running', containerId: name },
    });
    for (const d of service.domains) {
      await prisma.domain.update({
        where: { id: d.id },
        data: { certStatus: d.https ? 'pending' : 'active' },
      });
    }

    const finished = await prisma.deployment.update({
      where: { id: dep.id },
      data: { status: 'success', log: logs.join('\n'), finishedAt: new Date() },
    });
    log('Deploy concluído ✓');
    const url = hosts[0] ? `${tls ? 'https' : 'http'}://${hosts[0]}` : null;
    return { deployment: finished, url, container: name };
  } catch (e) {
    const msg = (e as Error).message;
    await prisma.service.update({ where: { id: serviceId }, data: { status: 'error' } }).catch(() => {});
    await prisma.deployment.update({
      where: { id: dep.id },
      data: { status: 'failed', log: logs.join('\n') + '\nERRO: ' + msg, finishedAt: new Date() },
    }).catch(() => {});
    throw e;
  }
}

// ---- ciclo de vida ----
function getContainerOrThrow(containerId: string | null) {
  if (!containerId) throw new Error('serviço ainda não tem container (faça deploy)');
  return docker.getContainer(containerId);
}

export async function startService(containerId: string | null) {
  await getContainerOrThrow(containerId).start();
}
export async function stopService(containerId: string | null) {
  await getContainerOrThrow(containerId).stop();
}
export async function restartService(containerId: string | null) {
  await getContainerOrThrow(containerId).restart();
}
export async function removeContainer(containerId: string | null) {
  if (!containerId) return;
  try { await docker.getContainer(containerId).remove({ force: true }); } catch { /* já removido */ }
}

// ---- observabilidade ----
// Demux do formato multiplexado do Docker (8 bytes de header por frame).
function demux(buf: Buffer): string {
  let out = '';
  let i = 0;
  while (i + 8 <= buf.length) {
    const size = buf.readUInt32BE(i + 4);
    out += buf.slice(i + 8, i + 8 + size).toString('utf8');
    i += 8 + size;
  }
  return out || buf.toString('utf8');
}

export async function serviceLogs(containerId: string | null, tail = 200): Promise<string> {
  const c = getContainerOrThrow(containerId);
  const buf = (await c.logs({ stdout: true, stderr: true, tail, timestamps: false })) as unknown as Buffer;
  return demux(buf);
}

export async function serviceStats(containerId: string | null) {
  const c = getContainerOrThrow(containerId);
  const s = await new Promise<any>((res, rej) =>
    c.stats({ stream: false }, (err: unknown, data: unknown) => (err ? rej(err) : res(data))),
  );
  const cpuDelta = s.cpu_stats.cpu_usage.total_usage - s.precpu_stats.cpu_usage.total_usage;
  const sysDelta = s.cpu_stats.system_cpu_usage - s.precpu_stats.system_cpu_usage;
  const cpus = s.cpu_stats.online_cpus || 1;
  const cpuPct = sysDelta > 0 ? (cpuDelta / sysDelta) * cpus * 100 : 0;
  const memUsage = s.memory_stats.usage || 0;
  const memLimit = s.memory_stats.limit || 0;
  return {
    cpuPct: Number(cpuPct.toFixed(2)),
    memUsageMB: Number((memUsage / 1024 / 1024).toFixed(1)),
    memLimitMB: Number((memLimit / 1024 / 1024).toFixed(1)),
    memPct: memLimit ? Number(((memUsage / memLimit) * 100).toFixed(2)) : 0,
  };
}
