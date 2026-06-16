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
| Proxy / data plane | **Traefik** (labels + Let's Encrypt) |
| Build sem Dockerfile | Nixpacks |
| Frontend | React · Vite · Tailwind |

## Arquitetura (resumo)

```
navegador ─HTTPS→ Traefik ─→ containers (apps do usuário)
                     ▲ labels
LiteDock API (Fastify) ─dockerode→ Docker Engine
   ├─ Postgres (estado)   └─ Redis (fila + pub/sub de logs)
```

A API (control plane) nunca expõe o `docker.sock`; toda mutação passa pela
camada de orquestração validada. Multi-servidor (futuro) via agentes.

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
| POST | `/services/:id/deploy` | **deploy real** (pull imagem → container → Traefik) |
| POST | `/services/:id/start\|stop\|restart` | ciclo de vida |
| DELETE | `/services/:id` | remove serviço (container + registro) |
| GET | `/services/:id/logs?tail=N` | logs do container |
| GET | `/services/:id/stats` | métricas CPU/memória |

### Subindo o Traefik (data plane)

```bash
docker compose -f docker-compose.traefik.yml up -d
# web:  127.0.0.1:8090  ·  websecure: 127.0.0.1:8453  ·  dashboard: 127.0.0.1:8091
```

> Traefik só roteia containers com label `litedock.managed=true` (constraint),
> em portas loopback alternativas — **não conflita com o nginx do host (80/443)**.

## Roadmap (fases do MVP)

- **Fase 0** — Fundação: scaffold, auth, Postgres/Redis, camada Docker ✅
- **Fase 1** — Deploy de imagem + domínio (Traefik) + env cifrada + logs/métricas + ciclo de vida ✅
- **Fase 2** — Build de código (Git + Nixpacks + webhooks CI/CD)
- **Fase 3** — Bancos de dados 1-clique + backups
- **Fase 4** — Observabilidade (logs, métricas, terminal web)
- **Fase 5** — App Store (templates Docker Compose)
- **Fase 6** — Multi-usuário, multi-servidor, billing
