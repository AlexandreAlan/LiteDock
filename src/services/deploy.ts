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
import { ensureProjectNetwork } from './worker.js';
import { servicesBaseDomain, generateUniqueHost } from './naming.js';

const NETWORK = config.traefikNetwork;

// Rede isolada por projeto: serviços do mesmo projeto se enxergam; projetos
// diferentes ficam em redes separadas (isolados) — só se falam via PONTE.
export function projectNetwork(slug: string) {
  return `litedock-net-${slug}`;
}

// Imagem padrão por engine de banco (quando o serviço é criado pelo painel
// só com a engine, sem imagem explícita).
const DB_IMAGES: Record<string, string> = {
  postgres: 'postgres:16',
  mysql: 'mysql:8',
  mariadb: 'mariadb:11',
  mongo: 'mongo:7',
  mongodb: 'mongo:7',
  redis: 'redis:7',
};

// Redes das PONTES ativas deste projeto (a rede do projeto-par, dos dois lados).
async function bridgeNetworks(projectId: string): Promise<string[]> {
  const bridges = await prisma.projectBridge.findMany({
    where: { OR: [{ aId: projectId }, { bId: projectId }] },
    include: { a: true, b: true },
  });
  const peers = bridges.map((br) => (br.aId === projectId ? br.b : br.a));
  return peers.map((p) => projectNetwork(p.slug));
}

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
  network = NETWORK,
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
        const ip: string | undefined = info.NetworkSettings?.Networks?.[network]?.IPAddress;
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
  const spec = (service.spec ?? {}) as { source?: string; image?: string; engine?: string; repo?: string };
  const isGit = (spec.source ?? (spec.repo ? 'git' : 'image')) === 'git';
  // Banco pode vir só com a engine (sem imagem) — o deployService resolve a imagem.
  const hasImage = !!spec.image || (service.type === 'database' && !!spec.engine);
  if (!isGit && !hasImage) throw new Error('defina a imagem (ou a engine do banco) na aba Source');
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

  const spec = (service.spec ?? {}) as {
    source?: 'image' | 'git';
    image?: string;
    engine?: string;
    port?: number;
    ports?: number[];
    volumes?: string[];
    repo?: string;
    branch?: string;
    subdir?: string;
    dockerfile?: string;
    credentialId?: string;
    limits?: { memMb?: number; cpus?: number; pidsLimit?: number };
  };
  // Limites efetivos: valor configurado por serviço (na GUI → aba Advanced) ou o
  // default da instância (config). Tetos protegem o host contra abuso (CPU/RAM, fork-bomb).
  const lim = spec.limits ?? {};
  const limMemMb = lim.memMb && lim.memMb > 0 ? lim.memMb : config.deployMemMB;
  const limCpus = lim.cpus && lim.cpus > 0 ? lim.cpus : config.deployCpus;
  const limPids = lim.pidsLimit && lim.pidsLimit > 0 ? lim.pidsLimit : config.deployPidsLimit;
  const isDb = service.type === 'database';
  // Banco sem imagem explícita: deriva da engine escolhida no painel.
  if (isDb && !spec.image && spec.engine) spec.image = DB_IMAGES[spec.engine] ?? spec.engine;
  const source: 'image' | 'git' = spec.source ?? (spec.repo ? 'git' : 'image');
  // Porta interna: spec.port, ou a 1ª de spec.ports (templates), ou padrão.
  const port = Number(spec.port || spec.ports?.[0] || (isDb ? 0 : 80));
  if (source === 'image' && !spec.image) throw new Error('spec.image é obrigatório (deploy por imagem)');
  if (source === 'git' && !spec.repo) throw new Error('spec.repo é obrigatório (deploy por código)');

  const dep = deploymentId
    ? await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'building', imageTag: spec.image } })
    : await prisma.deployment.create({ data: { serviceId, status: 'building', trigger: 'manual', imageTag: spec.image } });
  const logs: string[] = [];
  // Salva o log incremental no banco a cada 2s durante o build, para que o
  // frontend (polling 1.5s) exiba progresso em tempo real — não só no final.
  let flushTimer: ReturnType<typeof setInterval> | null = setInterval(async () => {
    if (logs.length) await prisma.deployment.update({ where: { id: dep.id }, data: { log: logs.join('\n') } }).catch(() => {});
  }, 2000);
  const stopFlush = () => { if (flushTimer) { clearInterval(flushTimer); flushTimer = null; } };
  const log = (l: string) => { logs.push(l); onLog(l); };

  try {
    // Rede isolada do projeto (criada + Traefik plugado pelo worker Python).
    const netName = projectNetwork(service.project.slug);
    await ensureProjectNetwork(service.project.slug).catch(async () => {
      // Fallback: se o worker estiver fora, cria a rede localmente.
      const nets = await docker.listNetworks();
      if (!nets.find((n) => n.Name === netName)) await docker.createNetwork({ Name: netName, Driver: 'bridge' });
    });
    const peerNets = await bridgeNetworks(service.project.id);
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

    // Auto-endereço (multi-tenant): app sem nenhum domínio ganha um subdomínio
    // ALEATÓRIO e ÚNICO sob o "Domínio dos serviços". https=false porque o nginx
    // termina o TLS com o cert wildcard e fala HTTP com o Traefik (Traefik fica
    // no entrypoint web). O usuário não faz nada manual — nasce no 1º deploy.
    if (!isDb && service.domains.length === 0) {
      const base = await servicesBaseDomain();
      for (let attempt = 0; attempt < 5; attempt++) {
        const host = await generateUniqueHost(base);
        try {
          const d = await prisma.domain.create({
            data: { serviceId, host, targetPort: port, https: false, certStatus: 'active' },
          });
          service.domains.push(d);
          log(`Endereço gerado: https://${host}`);
          break;
        } catch {
          // colisão no @unique (corrida) — tenta outro nome
        }
      }
    }

    const hosts = service.domains.map((d) => d.host);
    const tls = service.domains.some((d) => d.https);
    // Banco não entra no Traefik (não tem HTTP); app com domínios entra.
    const labels = isDb
      ? { 'litedock.managed': 'true', 'litedock.service': serviceId }
      : traefikLabels({ serviceId, routerName: name, hosts, port, tls, network: netName });

    // Volumes nomeados pra persistir dados (sobrevivem ao redeploy blue-green).
    const binds = (spec.volumes ?? []).map((path, i) => `litedock-${service.project.slug}-${service.name}-v${i}:${path}`);

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
      // Alias de rede = nome do serviço, pra outro serviço do projeto resolver
      // por DNS (ex.: app conecta no banco por "meuapp-db").
      NetworkingConfig: { EndpointsConfig: { [netName]: { Aliases: [service.name] } } },
      HostConfig: {
        RestartPolicy: { Name: 'unless-stopped' },
        NetworkMode: netName,
        Binds: binds.length ? binds : undefined,
        // Limites de recurso por tenant (configuráveis na GUI → aba Advanced; senão
        // usam o default da instância). Defesa contra abuso de CPU/RAM e fork-bomb.
        Memory: limMemMb * 1024 * 1024,
        MemorySwap: limMemMb * 1024 * 1024, // = Memory: sem swap extra além do limite
        NanoCpus: Math.round(limCpus * 1e9),
        PidsLimit: limPids,
        // Impede escalonamento de privilégio dentro do container do tenant.
        SecurityOpt: ['no-new-privileges:true'],
      },
    });
    await container.start();
    log(`Nova versão iniciada na rede isolada ${netName} ...`);

    // Pontes ativas: conecta este container às redes dos projetos-par.
    for (const peer of peerNets) {
      try { await docker.getNetwork(peer).connect({ Container: container.id }); log(`Ponte conectada → ${peer}`); }
      catch { /* já conectado ou rede ausente */ }
    }

    try {
      await waitHealthy(container, port, log, netName);
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

    stopFlush();
    const finished = await prisma.deployment.update({
      where: { id: dep.id },
      data: { status: 'success', log: logs.join('\n'), finishedAt: new Date() },
    });
    log('Deploy concluído ✓');
    const url = hosts[0] ? `${tls ? 'https' : 'http'}://${hosts[0]}` : null;
    fireDeployNotification(service.name, 'success', url).catch(() => {});
    return { deployment: finished, url, container: name };
  } catch (e) {
    stopFlush();
    const msg = (e as Error).message;
    await prisma.service.update({ where: { id: serviceId }, data: { status: 'error' } }).catch(() => {});
    await prisma.deployment.update({
      where: { id: dep.id },
      data: { status: 'failed', log: logs.join('\n') + '\nERRO: ' + msg, finishedAt: new Date() },
    }).catch(() => {});
    fireDeployNotification(service.name, 'failed', null).catch(() => {});
    throw e;
  }
}

// Envia notificação para o webhook (Discord/Slack) configurado nos Ajustes.
async function fireDeployNotification(serviceName: string, status: 'success' | 'failed', url: string | null) {
  const [webhookSetting, onDeploySetting] = await Promise.all([
    prisma.setting.findUnique({ where: { key: 'notifyWebhook' } }),
    prisma.setting.findUnique({ where: { key: 'notifyOnDeploy' } }),
  ]);
  const webhookUrl = webhookSetting?.value?.trim();
  if (!webhookUrl || onDeploySetting?.value !== 'true') return;

  const emoji = status === 'success' ? '✅' : '❌';
  const label = status === 'success' ? 'concluído com sucesso' : 'falhou';
  const text = `${emoji} LiteDock — Deploy de **${serviceName}** ${label}${url ? `\n${url}` : ''}`;

  // Discord e Slack aceitam payload diferente: detectamos pelo path.
  const isSlack = webhookUrl.includes('hooks.slack.com');
  const body = isSlack
    ? JSON.stringify({ text })
    : JSON.stringify({ content: text });

  await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
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

// ── Reconciliação de deploys interrompidos (graceful shutdown/boot) ──────────
// Um deploy roda in-process. Se a API morre no meio (restart da VPS, deploy do
// painel, crash), a linha do Deployment fica presa em building/deploying e pode
// sobrar um container temporário `<svc>__deploy-<id>` órfão. Esta função põe a
// casa em ordem: marca os deploys travados como falha (com nota no log) e
// remove os containers temporários órfãos. Roda no boot (cobre até crash duro)
// e no encerramento por sinal (SIGTERM/SIGINT).
export async function reconcileInterruptedDeploys(reason: string): Promise<{ deployments: number; containers: number }> {
  let deployments = 0;
  let containers = 0;

  // 1) Deploys presos → falha limpa.
  const stuck = await prisma.deployment.findMany({
    where: { status: { in: ['queued', 'building', 'deploying'] } },
    select: { id: true, serviceId: true, log: true },
  });
  for (const d of stuck) {
    await prisma.deployment.update({
      where: { id: d.id },
      data: {
        status: 'failed',
        log: (d.log ? d.log + '\n' : '') + `[reconcile] ${reason} — deploy interrompido, marcado como falha.`,
        finishedAt: new Date(),
      },
    }).catch(() => {});
    // Serviço que tinha ficado "deploying" volta pra estado de erro visível.
    await prisma.service.updateMany({
      where: { id: d.serviceId, status: 'deploying' },
      data: { status: 'error' },
    }).catch(() => {});
    deployments++;
  }

  // 2) Containers temporários do blue-green que nunca foram promovidos.
  try {
    const list = await docker.listContainers({ all: true });
    for (const c of list) {
      const name = (c.Names?.[0] || '').replace(/^\//, '');
      if (name.includes('__deploy-')) {
        try { await docker.getContainer(c.Id).remove({ force: true }); containers++; } catch { /* já foi */ }
      }
    }
  } catch { /* sem acesso ao Docker agora — segue */ }

  if (deployments || containers) {
    console.log(`[reconcile] ${reason}: ${deployments} deploy(s) e ${containers} container(es) temporário(s) limpos.`);
  }
  return { deployments, containers };
}

// Sincroniza status de todos os serviços com o estado real do Docker.
// Chamado periodicamente pelo servidor para manter a lista de projetos precisa,
// mesmo quando containers caem sem passar pelas rotas de lifecycle do LiteDock.
export async function syncContainerStatuses(): Promise<void> {
  const services = await prisma.service.findMany({
    where: { containerId: { not: null }, status: { notIn: ['stopped', 'created'] } },
    select: { id: true, containerId: true, status: true },
  });
  for (const s of services) {
    try {
      const info = await docker.getContainer(s.containerId!).inspect();
      const st = info.State as { Running: boolean };
      const target = st.Running ? 'running' : 'stopped';
      if (target !== s.status) {
        await prisma.service.update({ where: { id: s.id }, data: { status: target } }).catch(() => {});
      }
    } catch {
      // Container não existe mais — marca como stopped.
      if (s.status !== 'stopped') {
        await prisma.service.update({ where: { id: s.id }, data: { status: 'stopped' } }).catch(() => {});
      }
    }
  }
}
