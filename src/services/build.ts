// Build de código (Fase 2): clona um repositório Git e gera uma imagem Docker.
//
// Duas estratégias, igual ao EasyPanel:
//   • repo COM Dockerfile  → `docker build` (usa o Dockerfile do projeto)
//   • repo SEM Dockerfile  → `nixpacks build` (buildpack, detecta a stack sozinho)
//
// O resultado é só uma TAG de imagem local. Quem sobe o container é o
// `deployService` (mesmo fluxo blue-green do deploy por imagem) — build e
// deploy ficam desacoplados.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from '../config.js';

type LogFn = (line: string) => void;

const NIXPACKS_OK = '__LITEDOCK_NIXPACKS_OK__';
const NIXPACKS_FAIL = '__LITEDOCK_NIXPACKS_FAIL__';

// Build via buildpack (sem Dockerfile) delegado ao worker Python, que roda o
// nixpacks num container efêmero. Assim o host não precisa do nixpacks instalado
// — só o Docker. Lê a resposta em streaming e repassa cada linha pro log.
async function buildNixpacksViaWorker(imageTag: string, ctx: string, onLog: LogFn): Promise<void> {
  const res = await fetch(`${config.deployWorkerUrl}/build/nixpacks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ context: ctx, image_tag: imageTag }),
  });
  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => '');
    throw new Error(`worker /build/nixpacks ${res.status}: ${txt || res.statusText}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let ok = false;
  const handle = (line: string) => {
    if (line === NIXPACKS_OK || line.startsWith(NIXPACKS_OK)) { ok = true; return; }
    if (line.startsWith(NIXPACKS_FAIL)) { throw new Error(line.replace(NIXPACKS_FAIL, 'nixpacks:').trim()); }
    if (line) onLog(line);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n');
    buf = parts.pop() ?? '';
    for (const l of parts) handle(l);
  }
  if (buf) handle(buf);
  if (!ok) throw new Error('build nixpacks não confirmou sucesso');
}

export interface GitSource {
  repo: string;          // URL https do repositório
  branch?: string;       // default: branch padrão do remoto
  subdir?: string;       // contexto de build dentro do repo (default: raiz)
  dockerfile?: string;   // caminho do Dockerfile (default: Dockerfile)
  token?: string;        // token p/ repo privado (já decifrado pelo chamador)
}

// Roda um comando transmitindo stdout/stderr linha a linha pro log do deploy.
function run(cmd: string, args: string[], cwd: string, onLog: LogFn, extraEnv?: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, env: { ...process.env, ...extraEnv } });
    const pipe = (buf: Buffer) => buf.toString('utf8').split('\n').forEach((l) => l && onLog(l));
    p.stdout.on('data', pipe);
    p.stderr.on('data', pipe);
    p.on('error', (e) => reject(new Error(`falha ao executar ${cmd}: ${e.message}`)));
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} saiu com código ${code}`))));
  });
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

// Só https:// é aceito como fonte de repositório. spec.repo vem de input do
// tenant (não validado no schema da rota) e é passado pro `git clone` via
// spawn — sem essa checagem, um valor como "ext::sh -c ..." faz o próprio
// Git executar comandos arbitrários no host (transporte `ext::` do git),
// e não é mitigado por spawn usar array de args (o git interpreta o scheme,
// não é injeção de shell).
function assertHttpsRepoUrl(repo: string): void {
  let u: URL;
  try {
    u = new URL(repo);
  } catch {
    throw new Error('spec.repo inválido: não é uma URL');
  }
  if (u.protocol !== 'https:') {
    throw new Error(`spec.repo inválido: protocolo "${u.protocol}" não permitido (só https:)`);
  }
}

// Injeta o token na URL https pra clonar repo privado, sem logar o segredo.
function authUrl(repo: string, token?: string): string {
  if (!token) return repo;
  const u = new URL(repo);
  u.username = 'x-access-token';
  u.password = token;
  return u.toString();
}

// Clona o repo, escolhe a estratégia e devolve a tag da imagem gerada.
export async function buildFromGit(imageTag: string, src: GitSource, onLog: LogFn): Promise<string> {
  assertHttpsRepoUrl(src.repo);
  const work = await mkdtemp(join(tmpdir(), 'litedock-build-'));
  try {
    onLog(`Clonando ${src.repo}${src.branch ? ` (branch ${src.branch})` : ''} ...`);
    const cloneArgs = ['clone', '--depth', '1'];
    if (src.branch) cloneArgs.push('--branch', src.branch);
    cloneArgs.push(authUrl(src.repo, src.token), work);
    // GIT_ALLOW_PROTOCOL: defesa em profundidade — mesmo que a validação
    // acima seja contornada por algum caminho futuro, o próprio git recusa
    // qualquer transporte que não seja https.
    await run('git', cloneArgs, process.cwd(), (l) =>
      onLog(src.token ? l.replaceAll(src.token, '***') : l),
      { GIT_ALLOW_PROTOCOL: 'https' },
    );

    const ctx = src.subdir ? join(work, src.subdir) : work;
    const dockerfile = join(ctx, src.dockerfile || 'Dockerfile');

    if (await exists(dockerfile)) {
      onLog('Dockerfile encontrado → docker build');
      await run('docker', ['build', '-t', imageTag, '-f', dockerfile, ctx], process.cwd(), onLog);
    } else {
      onLog('Sem Dockerfile → nixpacks build (buildpack, conteinerizado no worker)');
      await buildNixpacksViaWorker(imageTag, ctx, onLog);
    }

    onLog(`Imagem ${imageTag} construída ✓`);
    return imageTag;
  } finally {
    // Limpa o checkout temporário (com ou sem erro).
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
