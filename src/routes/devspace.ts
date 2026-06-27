// DevSpace — descobre projetos em /var/www, detecta stacks, lê git e pm2.
import type { FastifyInstance } from 'fastify';
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const WWW = '/var/www';

// Apenas diretórios de sistema que nunca são projetos reais
const IGNORE_LEAF = new Set(['html', 'certbot']);

// Marcadores que indicam que uma pasta É um projeto (qualquer um desses basta)
const PROJECT_MARKERS = [
  'package.json', 'requirements.txt', 'pyproject.toml',
  'go.mod', 'docker-compose.yml', 'docker-compose.yaml',
  'index.html', 'Dockerfile', 'manage.py', 'main.py',
  'app.py', 'index.js', 'server.js', 'index.ts', 'server.ts',
];

type Stack =
  | 'Next.js' | 'React' | 'Vite' | 'Astro'
  | 'Fastify' | 'Express' | 'Node.js'
  | 'FastAPI' | 'Django' | 'Flask' | 'Python'
  | 'Go' | 'Docker Compose' | 'Static';

function detectStack(dir: string): { stacks: Stack[]; devCmd: string | null; port: number | null } {
  const stacks: Stack[] = [];
  let devCmd: string | null = null;
  let port: number | null = null;

  const pkgPath = join(dir, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        scripts?: Record<string, string>;
      };
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.next) { stacks.push('Next.js'); port = 3000; }
      else if (deps.astro) { stacks.push('Astro'); port = 4321; }
      else if (deps.vite) { stacks.push('Vite'); port = 5173; }
      else if (deps.react) stacks.push('React');
      if (deps.fastify) { stacks.push('Fastify'); port = port ?? 3000; }
      else if (deps.express) { stacks.push('Express'); port = port ?? 3000; }
      if (!stacks.length) stacks.push('Node.js');
      devCmd = pkg.scripts?.dev ?? pkg.scripts?.start ?? null;
      if (devCmd) devCmd = `npm run ${pkg.scripts?.dev ? 'dev' : 'start'}`;
    } catch { /* ignore */ }
  }

  if (existsSync(join(dir, 'requirements.txt')) || existsSync(join(dir, 'pyproject.toml'))) {
    const req = existsSync(join(dir, 'requirements.txt'))
      ? readFileSync(join(dir, 'requirements.txt'), 'utf8').toLowerCase()
      : '';
    if (req.includes('fastapi')) { stacks.push('FastAPI'); port = 8000; devCmd = 'uvicorn main:app --reload'; }
    else if (req.includes('django')) { stacks.push('Django'); port = 8000; devCmd = 'python manage.py runserver'; }
    else if (req.includes('flask')) { stacks.push('Flask'); port = 5000; devCmd = 'flask run'; }
    else stacks.push('Python');
  }

  if (existsSync(join(dir, 'go.mod'))) stacks.push('Go');
  if (existsSync(join(dir, 'docker-compose.yml')) || existsSync(join(dir, 'docker-compose.yaml'))) {
    stacks.push('Docker Compose');
  }
  if (!stacks.length) stacks.push('Static');

  return { stacks, devCmd, port };
}

function gitInfo(dir: string) {
  const run = (cmd: string) => {
    try { return execSync(cmd, { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 }).toString().trim(); }
    catch { return null; }
  };
  const branch = run('git rev-parse --abbrev-ref HEAD');
  if (!branch) return null;
  const commit = run('git log -1 --format=%s');
  const dirty = run('git status --porcelain');
  const ahead = run('git rev-list @{u}..HEAD --count 2>/dev/null') ?? '0';
  return { branch, commit, dirty: (dirty?.length ?? 0) > 0, ahead: Number(ahead) };
}

export interface Project {
  slug: string;
  name: string;
  path: string;
  stacks: Stack[];
  devCmd: string | null;
  port: number | null;
  git: { branch: string; commit: string | null; dirty: boolean; ahead: number } | null;
}

function hasDirectMarkers(dir: string): boolean {
  return PROJECT_MARKERS.some((m) => existsSync(join(dir, m)));
}

function isMonorepo(dir: string): boolean {
  // Tem filhos imediatos com marcadores de projeto (ex: frontend/ + api/)
  try {
    const children = readdirSync(dir, { withFileTypes: true })
      .filter((c) => c.isDirectory() && !c.name.startsWith('.') && c.name !== 'node_modules');
    const withMarkers = children.filter((c) =>
      PROJECT_MARKERS.some((m) => existsSync(join(dir, c.name, m))),
    );
    // Monorepo = tem pelo menos 2 subprojetos OU tem exatamente 1 bem nomeado (frontend, api, backend, web)
    return withMarkers.length >= 2
      || (withMarkers.length === 1 && ['frontend', 'api', 'backend', 'web', 'app'].includes(withMarkers[0].name));
  } catch { return false; }
}

function buildProject(dir: string, slug: string, name: string): Project {
  const { stacks, devCmd, port } = detectStack(dir);
  return { slug, name, path: dir, stacks, devCmd, port, git: gitInfo(dir) };
}

function scanProjects(): Project[] {
  const projects: Project[] = [];
  try {
    const top = readdirSync(WWW, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !IGNORE_LEAF.has(d.name) && !d.name.startsWith('.'));

    for (const d of top) {
      const dir = join(WWW, d.name);

      if (hasDirectMarkers(dir)) {
        // Projeto simples com markers na raiz (ex: /var/www/paraela)
        projects.push(buildProject(dir, d.name, d.name));
      } else {
        // Agrupador OU monorepo — varre filhos
        // Nível 2: cada filho pode ser projeto simples ou monorepo (ex: altivaai)
        try {
          const children = readdirSync(dir, { withFileTypes: true })
            .filter((c) => c.isDirectory() && !c.name.startsWith('.'));
          for (const c of children) {
            const childDir = join(dir, c.name);
            if (hasDirectMarkers(childDir) || isMonorepo(childDir)) {
              projects.push(buildProject(childDir, `${d.name}/${c.name}`, `${c.name} (${d.name})`));
            }
          }
        } catch { /* sem permissão, ignora */ }
      }
    }
  } catch { /* /var/www inacessível */ }

  return projects.sort((a, b) => (a.git ? -1 : 1) - (b.git ? -1 : 1) || a.name.localeCompare(b.name));
}

// Templates de scaffold por stack
const SCAFFOLDS: Record<string, { files: Record<string, string>; initCmd?: string }> = {
  'node-api': {
    files: {
      'package.json': JSON.stringify({ name: 'PROJECT_NAME', version: '1.0.0', scripts: { dev: 'node --watch index.js', start: 'node index.js' } }, null, 2),
      'index.js': `const http = require('http');\nconst server = http.createServer((_, res) => res.end('Hello World'));\nserver.listen(3000, () => console.log('Rodando em :3000'));\n`,
      '.gitignore': 'node_modules/\n.env\n',
    },
  },
  'fastify': {
    files: {
      'package.json': JSON.stringify({ name: 'PROJECT_NAME', version: '1.0.0', type: 'module', scripts: { dev: 'node --watch server.js', start: 'node server.js' }, dependencies: { fastify: '^5.0.0' } }, null, 2),
      'server.js': `import Fastify from 'fastify';\nconst app = Fastify({ logger: true });\napp.get('/', async () => ({ ok: true }));\napp.listen({ port: 3000, host: '0.0.0.0' });\n`,
      '.gitignore': 'node_modules/\n.env\n',
    },
    initCmd: 'npm install',
  },
  'express': {
    files: {
      'package.json': JSON.stringify({ name: 'PROJECT_NAME', version: '1.0.0', scripts: { start: 'node index.js', dev: 'node --watch index.js' }, dependencies: { express: '^4.21.0' } }, null, 2),
      'index.js': `const express = require('express');\nconst app = express();\napp.use(express.json());\napp.get('/', (_, res) => res.json({ ok: true }));\napp.listen(3000, () => console.log('Express em :3000'));\n`,
      '.gitignore': 'node_modules/\n.env\n',
    },
    initCmd: 'npm install',
  },
  'react-vite': {
    files: {
      'package.json': JSON.stringify({ name: 'PROJECT_NAME', version: '0.0.0', private: true, scripts: { dev: 'vite', build: 'tsc -b && vite build', preview: 'vite preview' }, dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' }, devDependencies: { '@vitejs/plugin-react': '^4.3.4', typescript: '~5.7.2', vite: '^6.2.0' } }, null, 2),
      'index.html': `<!doctype html>\n<html lang="pt-BR">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>PROJECT_NAME</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n`,
      'vite.config.ts': `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nexport default defineConfig({ plugins: [react()] });\n`,
      'src/main.tsx': `import { StrictMode } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App';\ncreateRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);\n`,
      'src/App.tsx': `export default function App() {\n  return <h1>PROJECT_NAME</h1>;\n}\n`,
      '.gitignore': 'node_modules/\ndist/\n.env\n',
    },
    initCmd: 'npm install',
  },
  'next': {
    files: {
      'package.json': JSON.stringify({ name: 'PROJECT_NAME', version: '0.1.0', private: true, scripts: { dev: 'next dev', build: 'next build', start: 'next start' }, dependencies: { next: '15.0.0', react: '^19.0.0', 'react-dom': '^19.0.0' } }, null, 2),
      'next.config.js': `/** @type {import('next').NextConfig} */\nconst nextConfig = {};\nmodule.exports = nextConfig;\n`,
      'app/layout.tsx': `export default function RootLayout({ children }: { children: React.ReactNode }) {\n  return <html lang="pt-BR"><body>{children}</body></html>;\n}\n`,
      'app/page.tsx': `export default function Home() {\n  return <main><h1>PROJECT_NAME</h1></main>;\n}\n`,
      '.gitignore': 'node_modules/\n.next/\n.env\n',
    },
    initCmd: 'npm install',
  },
  'astro': {
    files: {
      'package.json': JSON.stringify({ name: 'PROJECT_NAME', version: '0.0.1', scripts: { dev: 'astro dev', build: 'astro build', preview: 'astro preview' }, dependencies: { astro: '^5.0.0' } }, null, 2),
      'astro.config.mjs': `import { defineConfig } from 'astro/config';\nexport default defineConfig({});\n`,
      'src/pages/index.astro': `---\n---\n<!doctype html>\n<html lang="pt-BR">\n  <head><meta charset="UTF-8"><title>PROJECT_NAME</title></head>\n  <body><h1>PROJECT_NAME</h1></body>\n</html>\n`,
      '.gitignore': 'node_modules/\ndist/\n.env\n',
    },
    initCmd: 'npm install',
  },
  'fastapi': {
    files: {
      'main.py': `from fastapi import FastAPI\nfrom fastapi.middleware.cors import CORSMiddleware\n\napp = FastAPI(title="PROJECT_NAME")\napp.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])\n\n@app.get("/")\ndef root():\n    return {"ok": True, "app": "PROJECT_NAME"}\n`,
      'requirements.txt': 'fastapi\nuvicorn[standard]\n',
      '.gitignore': '__pycache__/\n*.pyc\n.env\nvenv/\n',
    },
  },
  'flask': {
    files: {
      'app.py': `from flask import Flask, jsonify\n\napp = Flask(__name__)\n\n@app.route("/")\ndef index():\n    return jsonify({"ok": True, "app": "PROJECT_NAME"})\n\nif __name__ == "__main__":\n    app.run(debug=True)\n`,
      'requirements.txt': 'flask\n',
      '.gitignore': '__pycache__/\n*.pyc\n.env\nvenv/\n',
    },
  },
  'django-lite': {
    files: {
      'requirements.txt': 'django\n',
      'manage.py': `#!/usr/bin/env python\nimport os\nimport sys\nif __name__ == "__main__":\n    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")\n    from django.core.management import execute_from_command_line\n    execute_from_command_line(sys.argv)\n`,
      'core/__init__.py': '',
      'core/settings.py': `from pathlib import Path\nBASE_DIR = Path(__file__).resolve().parent.parent\nSECRET_KEY = "change-me-in-production"\nDEBUG = True\nALLOWED_HOSTS = ["*"]\nINSTALLED_APPS = ["django.contrib.contenttypes", "django.contrib.auth"]\nROOT_URLCONF = "core.urls"\nDATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "db.sqlite3"}}\n`,
      'core/urls.py': `from django.http import JsonResponse\nfrom django.urls import path\nurlpatterns = [path("", lambda r: JsonResponse({"ok": True}))]\n`,
      '.gitignore': '__pycache__/\n*.pyc\n.env\nvenv/\ndb.sqlite3\n',
    },
  },
  'go-api': {
    files: {
      'go.mod': `module PROJECT_NAME\n\ngo 1.23\n`,
      'main.go': `package main\n\nimport (\n\t"encoding/json"\n\t"net/http"\n)\n\nfunc main() {\n\thttp.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {\n\t\tw.Header().Set("Content-Type", "application/json")\n\t\tjson.NewEncoder(w).Encode(map[string]bool{"ok": true})\n\t})\n\thttp.ListenAndServe(":8080", nil)\n}\n`,
      '.gitignore': 'bin/\n*.exe\n.env\n',
    },
  },
  'docker-compose': {
    files: {
      'docker-compose.yml': `version: "3.9"\nservices:\n  app:\n    image: nginx:alpine\n    ports:\n      - "8080:80"\n    restart: unless-stopped\n`,
      '.env.example': '# Copie para .env e preencha\n# PORTA=8080\n',
      '.gitignore': '.env\n',
    },
  },
  'static': {
    files: {
      'index.html': `<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>PROJECT_NAME</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>PROJECT_NAME</h1>\n  <script src="script.js"></script>\n</body>\n</html>\n`,
      'style.css': `* { box-sizing: border-box; margin: 0; padding: 0; }\nbody { font-family: system-ui, sans-serif; padding: 2rem; }\nh1 { font-size: 2rem; }\n`,
      'script.js': `console.log('PROJECT_NAME — iniciado');\n`,
    },
  },
};

export default async function devspaceRoutes(app: FastifyInstance) {
  app.get('/projects', { onRequest: [app.authenticate] }, async () => {
    return { projects: scanProjects() };
  });

  // Cria novo projeto em /var/www, scaffolda arquivos iniciais e opcionalmente
  // cria um serviço LiteDock (container via deploy engine) ou registra no PM2.
  app.post<{
    Body: {
      name: string;
      template: string;
      runtime: 'container' | 'pm2' | 'none';
      withGit?: boolean;
      withReadme?: boolean;
      withEnv?: boolean;
    };
  }>('/projects', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { name, template, runtime, withGit = true, withReadme = true, withEnv = false } = req.body;

    if (!name || !/^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$/.test(name)) {
      return reply.code(400).send({ error: 'Nome inválido (use letras minúsculas, números e hífens)' });
    }

    const dir = join(WWW, name);
    if (existsSync(dir)) return reply.code(409).send({ error: 'Já existe um projeto com esse nome' });

    const { mkdirSync, writeFileSync } = await import('node:fs');
    const { execSync: exec } = await import('node:child_process');

    mkdirSync(dir, { recursive: true });

    const scaffold = SCAFFOLDS[template] ?? SCAFFOLDS['static'];

    // Cria subpastas antes dos arquivos (ex: src/, app/, core/)
    for (const file of Object.keys(scaffold.files)) {
      const parts = file.split('/');
      if (parts.length > 1) {
        const { mkdirSync: mkdir2 } = await import('node:fs');
        mkdir2(join(dir, ...parts.slice(0, -1)), { recursive: true });
      }
    }

    for (const [file, content] of Object.entries(scaffold.files)) {
      writeFileSync(join(dir, file), content.replace(/PROJECT_NAME/g, name));
    }

    // Extras opcionais
    if (withReadme) {
      writeFileSync(join(dir, 'README.md'), `# ${name}\n\nDescrição do projeto.\n\n## Como rodar\n\n\`\`\`bash\n# insira o comando aqui\n\`\`\`\n`);
    }
    if (withEnv) {
      writeFileSync(join(dir, '.env'), '# Variáveis de ambiente\n# NODE_ENV=development\n');
    }

    // Git init + commit inicial
    if (withGit) {
      const run = (cmd: string) => { try { exec(cmd, { cwd: dir, stdio: 'ignore' }); } catch { /* ignora */ } };
      run('git init');
      run('git add -A');
      run('git commit -m "chore: scaffold inicial"');
    }

    // Instala deps se tiver initCmd
    if (scaffold.initCmd) {
      try { exec(scaffold.initCmd, { cwd: dir, stdio: 'ignore', timeout: 120_000 }); } catch { /* ignora */ }
    }

    const { stacks, devCmd, port } = detectStack(dir);

    // Cria serviço LiteDock (container Docker) se solicitado
    if (runtime === 'container') {
      const { prisma } = await import('../db.js');
      const server = await prisma.server.findFirst();
      if (server) {
        const proj = await prisma.project.create({
          data: { name, slug: name, ownerId: (req.user as { sub: string }).sub },
        });
        await prisma.service.create({
          data: {
            projectId: proj.id,
            serverId: server.id,
            name: 'app',
            type: 'app',
            spec: { source: 'git', repo: `file://${dir}`, port: port ?? 3000 },
          },
        });
        return { path: dir, stacks, devCmd, runtime, projectCreated: true };
      }
    }

    // PM2 — registra processo direto no host
    if (runtime === 'pm2') {
      const cmd = devCmd ?? 'node index.js';
      try {
        exec(`pm2 start ${JSON.stringify(cmd)} --name ${JSON.stringify(name)} --cwd ${JSON.stringify(dir)}`, { stdio: 'ignore' });
      } catch { /* pm2 pode falhar se não instalado */ }
    }

    return { path: dir, stacks, devCmd, runtime, projectCreated: false };
  });

  // Publica um projeto JÁ EXISTENTE em /var/www (não cria arquivos, só registra)
  app.post<{
    Body: { path: string; name: string; port: number; runtime: 'pm2' | 'container' };
  }>('/publish', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { path: projectPath, name, port, runtime } = req.body;

    if (!projectPath.startsWith('/var/www/')) {
      return reply.code(400).send({ error: 'Path deve estar em /var/www' });
    }
    if (!existsSync(projectPath)) {
      return reply.code(404).send({ error: 'Pasta não encontrada no servidor' });
    }

    const { stacks, devCmd } = detectStack(projectPath);

    if (runtime === 'container') {
      const { prisma } = await import('../db.js');
      const server = await prisma.server.findFirst();
      if (!server) return reply.code(500).send({ error: 'Nenhum servidor configurado no LiteDock' });
      const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const proj = await prisma.project.create({
        data: { name, slug, ownerId: (req.user as { sub: string }).sub },
      });
      await prisma.service.create({
        data: {
          projectId: proj.id,
          serverId: server.id,
          name: 'app',
          type: 'app',
          spec: { source: 'local', path: projectPath, port },
        },
      });
      return { ok: true, runtime, stacks, devCmd, projectId: proj.id };
    }

    if (runtime === 'pm2') {
      const cmd = devCmd ?? 'node index.js';
      try {
        execSync(
          `pm2 start ${JSON.stringify(cmd)} --name ${JSON.stringify(name)} --cwd ${JSON.stringify(projectPath)}`,
          { stdio: 'ignore' },
        );
      } catch { /* processo pode já existir — ignora */ }
      return { ok: true, runtime, stacks, devCmd };
    }

    return reply.code(400).send({ error: 'runtime inválido' });
  });
}
