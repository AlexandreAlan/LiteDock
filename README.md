# LiteDock 🐳

Painel de gerenciamento de servidores e deploys — mesma proposta do EasyPanel
(camada visual e orquestradora em cima do Docker), com foco em **facilidade** e
**PT-BR**. Software proprietário.

> ⚠️ Proprietário. Todos os direitos reservados. Não distribuir.

## Stack

| Camada | Tecnologia |
|---|---|
| Backend / control plane | Node 20+ · TypeScript · **Fastify** |
| Banco de estado | **PostgreSQL** · Prisma (ORM + migrations) |
| Fila / jobs | Redis · BullMQ |
| Docker | **dockerode** (Docker Engine API) |
| Automação de deploy | **Python · FastAPI** (worker no loopback) |
| Proxy / data plane | **Traefik** (labels + Let's Encrypt) |
| Build sem Dockerfile | Nixpacks |
| Frontend | React · Vite · Tailwind |

## Arquitetura (resumo)

```
navegador ─HTTPS→ Traefik ─→ containers (apps do usuário)
                     ▲ labels
LiteDock API (Fastify) ──┬─dockerode→ Docker Engine
   ├─ Postgres (estado)  └─HTTP loopback→ Deploy Worker (FastAPI/Python)
   └─ Redis (fila + pub/sub de logs)
```

A API (control plane) nunca expõe o `docker.sock`; toda mutação passa pela
camada de orquestração validada. Multi-servidor (futuro) via agentes.

**Divisão de responsabilidades (catálogo vs. automação):** o catálogo/loja de
templates e os registros de serviço ficam no Node (CRUD). A automação "braçal"
do deploy (pull de imagem, subir/parar/remover container, logs) é delegada a um
**worker Python (FastAPI)** no loopback (`127.0.0.1:8089`), nos moldes de um
worker de automação. O worker arranca em **modo seguro** (`SAFE_MODE=true`):
devolve o *plano* (dry-run) com o `docker run` equivalente, sem tocar no Docker,
até ser liberado com `SAFE_MODE=false`.

## Modelo de dados

`User · Server · Project · Service (app|database) · EnvVar · Domain ·
Deployment · Credential · Backup` — ver `prisma/schema.prisma`.

## Rodando em desenvolvimento

```bash
# 1) infra isolada (Postgres :5440, Redis :6390)
docker compose -f docker-compose.dev.yml up -d

# 2) deps + banco
npm install
npm run db:push

# 3) API
npm run dev        # http://127.0.0.1:8088
```

### Endpoints (Fase 0)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/health` | status |
| POST | `/auth/register` | cria usuário (1º vira `owner`) |
| POST | `/auth/login` | login → JWT |
| GET | `/auth/me` | usuário logado |
| GET | `/projects` | lista projetos |
| POST | `/projects` | cria projeto |
| GET | `/projects/:id` | detalhe |
| DELETE | `/projects/:id` | remove |
| POST | `/projects/:id/services` | cria serviço (app/db) |
| GET | `/servers/local/engine` | versão da Docker Engine |
| GET | `/servers/local/containers` | containers do host |

### Endpoints (Fase 1 — deploy real + observabilidade)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/services/:id` | detalhe (segredos mascarados) |
| POST | `/services/:id/env` | upsert de env var (cifrada AES-256-GCM) |
| DELETE | `/services/:id/env/:key` | remove env var |
| POST | `/services/:id/domains` | adiciona domínio (roteamento Traefik) |
| DELETE | `/services/:id/domains/:domainId` | remove domínio |
| POST | `/services/:id/deploy` | **deploy assíncrono**: enfileira (lock por serviço) e responde `202 {deploymentId}` na hora; troca **blue-green** com healthcheck |
| GET | `/services/:id/deployments/:depId` | status do deployment (polling durante o deploy) |
| POST | `/services/:id/webhook` | gera/rotaciona o token e devolve a URL do webhook de CI/CD |
| POST | `/webhooks/services/:id/deploy?token=` | **público** (sem JWT): push do Git → deploy on-push |
| POST | `/services/:id/start\|stop\|restart` | ciclo de vida (serializado com o deploy) |
| DELETE | `/services/:id` | remove serviço (container + registro) |
| GET | `/services/:id/logs?tail=N` | logs do container |
| GET | `/services/:id/stats` | métricas CPU/memória |

### Endpoints (loja de templates + worker Python)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/templates` | catálogo de apps prontos (categorias + cards) |
| GET | `/templates/:slug` | detalhe de um template |
| POST | `/templates/:slug/install` | instala no projeto (cria serviços + envs/segredos) |
| POST | `/services/:id/plan` | monta o spec e **delega ao worker Python** (deploy real / dry-run) |
| GET | `/services/worker/health` | saúde do worker e estado do modo seguro |

### Subindo o Traefik (data plane)

```bash
docker compose -f docker-compose.traefik.yml up -d
# web:  127.0.0.1:8090  ·  websecure: 127.0.0.1:8453  ·  dashboard: 127.0.0.1:8091
```

> Traefik só roteia containers com label `litedock.managed=true` (constraint),
> em portas loopback alternativas — **não conflita com o nginx do host (80/443)**.

### Subindo o Deploy Worker (Python)

```bash
cd deploy-worker
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
# modo seguro (dry-run) por padrão; loopback 127.0.0.1:8089
SAFE_MODE=true uvicorn main:app --host 127.0.0.1 --port 8089
```

> O Node fala com o worker via `DEPLOY_WORKER_URL` (default `http://127.0.0.1:8089`).
> Em produção sobe via pm2 no loopback. Para deploy real: `SAFE_MODE=false`.

## Roadmap (fases do MVP)

- **Fase 0** — Fundação: scaffold, auth, Postgres/Redis, camada Docker ✅
- **Fase 1** — Deploy de imagem + domínio (Traefik) + env cifrada + logs/métricas + ciclo de vida ✅
- **Fase 2** — Build de código (Git + Nixpacks + webhooks CI/CD) ✅ clone do
  repo, build por **Dockerfile** ou **Nixpacks** e **webhook on-push**
  (⚠️ requer o binário `nixpacks` instalado no host para repos sem Dockerfile)
- **Fase 3** — Bancos de dados 1-clique + backups
- **Fase 4** — Observabilidade (logs, métricas, terminal web)
- **Fase 5** — App Store (loja de templates 1-clique) 🚧 catálogo + instalação ✅; deploy real via worker Python (modo seguro)
- **Fase 6** — Multi-usuário, multi-servidor, billing

## Histórico de versões

- **v0.6** — Fase 2: **deploy de código**. Clona o repositório Git e gera a
  imagem por **Dockerfile** (`docker build`) ou **Nixpacks** (buildpack, sem
  Dockerfile) — depois entra no mesmo fluxo blue-green do deploy por imagem.
  Repo privado via `Credential` (token cifrado). **Webhook de CI/CD** (rota
  pública autenticada por token único do serviço, comparação em tempo
  constante): push no Git → deploy on-push.
- **v0.5** — Robustez da automação de deploy: deploy **assíncrono** (responde
  `202 {deploymentId}`, frontend faz polling — sem mais timeout no pull),
  **lock por serviço** (fila in-process — fim das corridas de duplo-clique;
  estado durável fica no Postgres) e troca **blue-green com healthcheck**
  (sobe a nova versão, valida saúde e só então aponta o tráfego; deploy ruim
  **não derruba** o serviço — rollback automático). `start/stop/restart/delete`
  passam a serializar pelo mesmo lock.
- **v0.4** — Loja de templates estilo EasyPanel (22 apps, instalação 1-clique cria
  serviços + envs/segredos) e **worker de deploy em Python (FastAPI)** no loopback,
  com modo seguro (dry-run). Node delega a automação ao worker via `/services/:id/plan`.
- **v0.3** — Paridade visual com o EasyPanel: paleta de comandos ⌘K funcional,
  modo escuro (tokens via CSS vars + persistência), IP público real no rodapé.
- **v0.2** — Fase 1: deploy real por imagem, domínios via Traefik, env cifrada
  (AES-256-GCM), logs/métricas e ciclo de vida dos serviços.
- **v0.1** — Fase 0: fundação (scaffold, auth/JWT, Postgres/Redis, camada Docker).
