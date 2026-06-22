// Engine de deploy: orquestra o ciclo de vida de um serviço via Docker.
// Fase 1: deploy por IMAGEM. Cria o container na rede do Traefik com os labels
// de roteamento. Não publica porta no host (Traefik faz a ponte).
import net from 'node:net';
import { docker } from './docker.js';
import { prisma } from '../db.js';
import { decrypt } from '../lib/crypto.js';
import { traefikLabels } from './traefik.js';
import { buildFromGit } from './build.js';
import { enqueue } from '../lib/queue.js';
import { config } from '../config.js';

const NETWORK = config.traefikNetwork;

type LogFn = (line: string) => void;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Testa se a porta interna do container já aceita conexão (best-effort).
function tcpOk(host: string, port: number, timeout = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    const done = (ok: boolean) => { sock.destroy(); resolve(ok); };
    sock.setTimeout(timeout);
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
    sock.connect(port, host);
  });
}

// Espera o novo container ficar saudável antes de mandar tráfego pra ele.
// - Imagem COM HEALTHCHECK: confia no status do Docker (healthy/unhealthy).
// - Imagem SEM HEALTHCHECK: aceita após rodar estável por alguns segundos
//   (pega o caso mais comum de deploy ruim: o app que crasha no boot) e, como
//   bônus, confirma que a porta interna respondeu.
async function waitHealthy(
  container: { inspect: () => Promise<any> },
  port: number,
  onLog: LogFn,
  timeoutMs = 60000,
) {
  const STABLE_MS = 8000;
  const start = Date.now();
  let runningSince = 0;
  while (Date.now() - start < timeoutMs) {
    const info = await container.inspect();
    const st = info.State;
    if (st.Running) {
      if (!runningSince) runningSince = Date.now();
      const health: string | undefined = st.Health?.Status;
      if (health === 'healthy') { onLog('Healthcheck OK ✓'); return; }
      if (health === 'unhealthy') throw new Error('healthcheck reportou unhealthy');
      if (!health) {
        const ip: string | undefined = info.NetworkSettings?.Networks?.[NETWORK]?.IPAddress;
        if (ip && port && (await tcpOk(ip, port))) { onLog(`Porta ${port} respondendo ✓`); return; }
        if (Date.now() - runningSince >= STABLE_MS) { onLog('Container estável ✓'); return; }
      }
      // health === 'starting' → segue aguardando
    } else {
      runningSince = 0;
      if (st.Status === 'exited') throw new Error(`container saiu no boot (exit ${st.ExitCode})`);
    }
    await sleep(1500);
  }
  throw new Error(`timeout (${timeoutMs / 1000}s) esperando o container ficar saudável`);
}

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

// Cria o registro de deployment e ENFILEIRA o job (lock por serviço). Não
// bloqueia: o chamador responde na hora e acompanha pelo registro. Idempotente
// — se já há um deploy em andamento, devolve esse (duplo-clique/webhook viram
// no-op). Usado tanto pela rota autenticada quanto pelo webhook de CI/CD.
export async function enqueueDeploy(
  serviceId: string,
  trigger: 'manual' | 'webhook' | 'api' = 'manual',
) {
  const inflight = await prisma.deployment.findFirst({
    where: { serviceId, status: { in: ['queued', 'building', 'deploying'] } },
    orderBy: { startedAt: 'desc' },
  });
  if (inflight) return { deployment: inflight, alreadyRunning: true };

  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) throw new Error('serviço não encontrado');
  if (service.type !== 'app') throw new Error('deploy automático só para apps');
  const spec = (service.spec ?? {}) as { source?: string; image?: string; repo?: string };
  const isGit = (spec.source ?? (spec.repo ? 'git' : 'image')) === 'git';
  if (!isGit && !spec.image) throw new Error('spec.image é obrigatório (deploy por imagem)');
  if (isGit && !spec.repo) throw new Error('spec.repo é obrigatório (deploy por código)');

  const dep = await prisma.deployment.create({
    data: { serviceId, status: 'queued', trigger, imageTag: spec.image ?? null },
  });
  // dispara e segue — deployService grava o resultado (sucesso/falha) no registro
  void enqueue(`deploy:${serviceId}`, () => deployService(serviceId, dep.id)).catch(() => {});
  return { deployment: dep, alreadyRunning: false };
}

// Deploy completo de um serviço do tipo 'app' a partir de uma imagem.
// `deploymentId` opcional: quando a rota já criou o registro `queued` (fila),
// reaproveita ele; senão cria um novo (compat com chamadas diretas).
export async function deployService(serviceId: string, deploymentId?: string, onLog: LogFn = () => {}) {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    include: { project: true, envVars: true, domains: true },
  });
  if (!service) throw new Error('serviço não encontrado');
  if (service.type !== 'app') throw new Error('deploy automático só para apps por enquanto');

  const spec = (service.spec ?? {}) as {
    source?: 'image' | 'git';
    image?: string;
    port?: number;
    repo?: string;
    branch?: string;
    subdir?: string;
    dockerfile?: string;
    credentialId?: string;
  };
  const source: 'image' | 'git' = spec.source ?? (spec.repo ? 'git' : 'image');
  const port = Number(spec.port || 80);
  if (source === 'image' && !spec.image) throw new Error('spec.image é obrigatório (deploy por imagem)');
  if (source === 'git' && !spec.repo) throw new Error('spec.repo é obrigatório (deploy por código)');

  const dep = deploymentId
    ? await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'building', imageTag: spec.image } })
    : await prisma.deployment.create({ data: { serviceId, status: 'building', trigger: 'manual', imageTag: spec.image } });
  const logs: string[] = [];
  const log = (l: string) => { logs.push(l); onLog(l); };

  try {
    await ensureNetwork();
    await prisma.service.update({ where: { id: serviceId }, data: { status: 'deploying' } });

    // Resolve a imagem a subir: build do código (Git) ou pull de imagem pronta.
    let image: string;
    if (source === 'git') {
      const tag = `litedock-build/${service.project.slug}-${service.name}:${dep.id.slice(0, 8)}`;
      let token: string | undefined;
      if (spec.credentialId) {
        const cred = await prisma.credential.findUnique({ where: { id: spec.credentialId } });
        if (cred) token = decrypt(cred.token);
      }
      log('Build a partir do código-fonte ...');
      image = await buildFromGit(
        tag,
        { repo: spec.repo!, branch: spec.branch, subdir: spec.subdir, dockerfile: spec.dockerfile, token },
        log,
      );
      await prisma.deployment.update({ where: { id: dep.id }, data: { imageTag: image } });
    } else {
      image = spec.image!;
      log(`Baixando imagem ${image} ...`);
      await pullImage(image, log);
    }

    const name = containerName(service.project.slug, service.name);
    const env = service.envVars.map((e) => `${e.key}=${e.isSecret ? decrypt(e.value) : e.value}`);
    const hosts = service.domains.map((d) => d.host);
    const tls = service.domains.some((d) => d.https);
    const labels = traefikLabels({ serviceId, routerName: name, hosts, port, tls });

    // Blue-green: sobe o novo container com nome temporário, valida a saúde e
    // só então remove o antigo e assume o nome canônico. Se o novo falhar, o
    // antigo continua no ar — um deploy ruim não derruba o serviço do cliente.
    await prisma.deployment.update({ where: { id: dep.id }, data: { status: 'deploying' } });
    const tempName = `${name}__deploy-${dep.id.slice(0, 8)}`;
    try { await docker.getContainer(tempName).remove({ force: true }); } catch { /* não existia */ }

    log('Criando nova versão ...');
    const container = await docker.createContainer({
      name: tempName,
      Image: image,
      Env: env,
      Labels: labels,
      HostConfig: {
        RestartPolicy: { Name: 'unless-stopped' },
        NetworkMode: NETWORK,
      },
    });
    await container.start();
    log('Nova versão iniciada, validando saúde ...');

    try {
      await waitHealthy(container, port, log);
    } catch (he) {
      // Rollback: descarta a nova versão e mantém a atual no ar intacta.
      log(`Validação falhou: ${(he as Error).message} — revertendo (versão atual segue no ar)`);
      try { await container.remove({ force: true }); } catch { /* já removido */ }
      throw he;
    }

    // Saudável → troca: remove a versão anterior e o novo assume o nome canônico.
    try {
      const old = docker.getContainer(name);
      await old.remove({ force: true });
      log('Versão anterior removida');
    } catch { /* não existia */ }
    await container.rename({ name });
    log('Tráfego apontado para a nova versão ✓');

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
