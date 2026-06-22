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

type LogFn = (line: string) => void;

export interface GitSource {
  repo: string;          // URL https do repositório
  branch?: string;       // default: branch padrão do remoto
  subdir?: string;       // contexto de build dentro do repo (default: raiz)
  dockerfile?: string;   // caminho do Dockerfile (default: Dockerfile)
  token?: string;        // token p/ repo privado (já decifrado pelo chamador)
}

// Roda um comando transmitindo stdout/stderr linha a linha pro log do deploy.
function run(cmd: string, args: string[], cwd: string, onLog: LogFn): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, env: process.env });
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

// Injeta o token na URL https pra clonar repo privado, sem logar o segredo.
function authUrl(repo: string, token?: string): string {
  if (!token) return repo;
  try {
    const u = new URL(repo);
    u.username = 'x-access-token';
    u.password = token;
    return u.toString();
  } catch {
    return repo;
  }
}

// Clona o repo, escolhe a estratégia e devolve a tag da imagem gerada.
export async function buildFromGit(imageTag: string, src: GitSource, onLog: LogFn): Promise<string> {
  const work = await mkdtemp(join(tmpdir(), 'litedock-build-'));
  try {
    onLog(`Clonando ${src.repo}${src.branch ? ` (branch ${src.branch})` : ''} ...`);
    const cloneArgs = ['clone', '--depth', '1'];
    if (src.branch) cloneArgs.push('--branch', src.branch);
    cloneArgs.push(authUrl(src.repo, src.token), work);
    // Filtra o token caso apareça em alguma mensagem de erro do git.
    await run('git', cloneArgs, process.cwd(), (l) =>
      onLog(src.token ? l.replaceAll(src.token, '***') : l),
    );

    const ctx = src.subdir ? join(work, src.subdir) : work;
    const dockerfile = join(ctx, src.dockerfile || 'Dockerfile');

    if (await exists(dockerfile)) {
      onLog('Dockerfile encontrado → docker build');
      await run('docker', ['build', '-t', imageTag, '-f', dockerfile, ctx], process.cwd(), onLog);
    } else {
      onLog('Sem Dockerfile → nixpacks build (buildpack)');
      await run('nixpacks', ['build', ctx, '--name', imageTag], process.cwd(), onLog);
    }

    onLog(`Imagem ${imageTag} construída ✓`);
    return imageTag;
  } finally {
    // Limpa o checkout temporário (com ou sem erro).
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
