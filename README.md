<div align="center">

# LiteDock

**Deploy apps com Docker em 30 segundos — sem configurar nada manualmente.**

[![MIT License](https://img.shields.io/badge/licença-MIT-10b981?style=flat-square)](LICENSE)
[![Node 20+](https://img.shields.io/badge/node-20+-10b981?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/docker-required-2496ed?style=flat-square&logo=docker&logoColor=white)](https://docker.com)
[![Demo](https://img.shields.io/badge/demo-ao%20vivo-10b981?style=flat-square)](https://demo.litedock.morenadoaco.com.br)

LiteDock é um painel open-source de gerenciamento de servidores inspirado no EasyPanel,
construído do zero com foco em **simplicidade**, **segurança** e **PT-BR**.
Configure uma imagem Docker ou repositório Git e o LiteDock cuida de tudo:
build, deploy blue-green, HTTPS automático, variáveis criptografadas e monitoramento em tempo real.

[🚀 Demo ao vivo](https://demo.litedock.morenadoaco.com.br) · [Issues](https://github.com/AlexandreAlan/LiteDock/issues) · [Releases](https://github.com/AlexandreAlan/LiteDock/releases)

</div>

---

## Capturas de tela

### Dashboard — projetos e métricas da VPS em tempo real
![Dashboard](docs/screenshots/01-dashboard.png)

### Monitor — todos os containers com CPU, memória e rede ao vivo
![Monitor](docs/screenshots/02-monitor.png)

### Serviço — botão Abrir, Deploy blue-green, URL gerada automaticamente
![Serviço](docs/screenshots/03-service.png)

### Métricas — gráficos de histórico por container
![Métricas](docs/screenshots/04-metrics.png)

---

## Funcionalidades

| Feature | Detalhes |
|---|---|
| **Deploy por imagem** | Qualquer imagem Docker Hub ou registry privado |
| **Deploy por Git** | Nixpacks detecta a stack (Node, Python, Go, PHP…); ou Dockerfile manual |
| **HTTPS automático** | Traefik + Let's Encrypt — sem configurar nginx ou certbot |
| **URL aleatória por serviço** | Subdomínio único gerado no 1º deploy (`veloz-aguia-a3f2.seudominio.com`) |
| **Deploy blue-green** | Nova versão sobe antes de derrubar a anterior — zero downtime |
| **Variáveis de ambiente** | Segredos cifrados AES-256-GCM em repouso |
| **Monitoramento em tempo real** | CPU / RAM / rede por container + gráficos de histórico (~1h) |
| **CI/CD por webhook** | URL para colar no GitHub/GitLab — cada push = redeploy automático |
| **Agendamento** | Liga e desliga containers automaticamente por horário |
| **Paleta de comandos ⌘K** | Busca rápida por projetos e serviços |
| **Multi-tenant seguro** | Containers isolados por projeto; limite de CPU/RAM/PIDs por serviço |
| **Tema claro/escuro** | Persistido por preferência do usuário |
| **2FA (TOTP)** | Autenticação em dois fatores para a conta |
| **Templates** | Catálogo com 1-click deploy (n8n, Grafana, code-server, WordPress…) |

---

## Stack técnica

```
navegador ──HTTPS──► Traefik ──► containers (apps do usuário)
                        ▲ labels dinâmicos
LiteDock API (Fastify / Node 20 / TypeScript)
  ├── PostgreSQL + Prisma   estado dos serviços, env, domínios
  ├── Redis + BullMQ        fila de deploys e pub/sub de logs
  ├── dockerode             Docker Engine API (via socket proxy)
  └── Deploy Worker (FastAPI / Python)  operações de sistema

Frontend: React · Vite · Tailwind · Framer Motion
Proxy:    Traefik v3 (labels + ACME automático)
Build:    Nixpacks (zero-config) ou Dockerfile customizado
```

---

## Requisitos

- Linux com Docker + Docker Compose Plugin
- Node 20+
- Python 3.11+ (Deploy Worker)
- PostgreSQL 14+ e Redis 7+
- Domínio com wildcard DNS apontando para o servidor

---

## Instalação rápida

```bash
git clone https://github.com/AlexandreAlan/LiteDock.git
cd LiteDock

cp .env.example .env
# Edite .env: DATABASE_URL, JWT_SECRET, LITEDOCK_SERVICES_DOMAIN...

# Banco + cache (desenvolvimento)
docker compose -f docker-compose.dev.yml up -d

# Migrações
npx prisma migrate deploy

# API
pm2 start ecosystem.config.cjs

# Frontend (build de produção)
cd web && npm ci && npm run build
# Sirva web/dist com nginx
```

Acesse `http://localhost:8088` — crie sua conta na primeira vez.

---

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | `postgres://user:pass@host:5432/litedock` |
| `REDIS_URL` | `redis://localhost:6379` |
| `JWT_SECRET` | Segredo aleatório (mín. 32 chars) |
| `LITEDOCK_SERVICES_DOMAIN` | Domínio base dos serviços (ex: `apps.seudominio.com`) |
| `PORT` | Porta da API (padrão: `8088`) |
| `LITEDOCK_DEFAULT_MEM_MB` | RAM padrão por container em MB (padrão: `1024`) |
| `LITEDOCK_DEFAULT_CPUS` | vCPUs padrão por container (padrão: `1`) |

---

## Segurança por design

- **Docker Socket Proxy** — API do Docker exposta com superfície mínima (sem exec, sem swarm)
- **Label gate** — só containers `litedock.managed=true` podem ser controlados pelo painel
- **AES-256-GCM** — variáveis de ambiente criptografadas em repouso
- **Limites por container** — CPU/RAM/PIDs configuráveis na GUI (proteção contra abuso)
- **no-new-privileges** — escalonamento de privilégio bloqueado em todos os deployments
- **JWT + 2FA TOTP** — autenticação segura com segundo fator opcional
- **bcrypt (fator 12)** — senhas com hash forte

---

## Contribuindo

PRs são bem-vindos! Abra uma issue antes de codar algo grande para alinhar a direção.

1. Fork → branch → commits atômicos
2. `npm run build` no frontend sem erros de TypeScript
3. Descreva o *porquê* da mudança no PR

---

## Licença

[MIT](LICENSE) — use, modifique e distribua livremente.

---

<div align="center">
  Feito no Brasil 🇧🇷 &nbsp;·&nbsp; Inspirado no EasyPanel, construído do zero
</div>
