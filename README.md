<div align="center">

# LiteDock

**Deploy apps com Docker em 30 segundos — sem configurar nada manualmente.**

[![CI](https://img.shields.io/github/actions/workflow/status/AlexandreAlan/LiteDock/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/AlexandreAlan/LiteDock/actions)
[![PolyForm Shield 1.0.0](https://img.shields.io/badge/licença-PolyForm%20Shield%201.0.0-10b981?style=flat-square)](LICENSE)
[![Node 20+](https://img.shields.io/badge/node-20+-10b981?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/docker-required-2496ed?style=flat-square&logo=docker&logoColor=white)](https://docker.com)
[![Demo](https://img.shields.io/badge/demo-ao%20vivo-10b981?style=flat-square)](https://demo.litedock.morenadoaco.com.br)
[![PRs Welcome](https://img.shields.io/badge/PRs-bem--vindos-10b981?style=flat-square)](CONTRIBUTING.md)

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
| **Log de deploy em tempo real** | Log salvo incrementalmente a cada 2s; auto-scroll; histórico de deploys expandível |
| **Variáveis de ambiente** | Segredos cifrados AES-256-GCM; importação em lote; revelar/copiar valor; exportar .env |
| **Monitoramento em tempo real** | CPU / RAM / rede por container + gráficos de histórico (~1h); filtro por nome |
| **CI/CD por webhook** | URL para colar no GitHub/GitLab — cada push = redeploy automático |
| **Notificações Discord/Slack** | Webhook configurável em Ajustes → Notificações; botão Testar integrado |
| **Agendamento** | Liga e desliga containers por horário — configurável na aba Advanced de cada serviço |
| **Renomear projeto e serviço** | Edição inline com ícone de lápis — slug Docker preservado sem interrupção |
| **Reordenar projetos** | Arraste e solte na página principal — ordem salva localmente |
| **Mover serviço entre projetos** | Arraste o card do serviço para outro projeto — bloqueia se já existir serviço com o mesmo nome no destino |
| **Busca de projetos e serviços** | Filtro em tempo real na página principal (nome do projeto ou serviço) |
| **Redes entre projetos** | Crie pontes para serviços de projetos diferentes se enxergarem |
| **Paleta de comandos ⌘K** | Busca rápida por projetos e serviços |
| **Notificações toast** | Feedback visual para todas as ações (sucesso, erro, info) |
| **Multi-tenant seguro** | Containers isolados por projeto; limite de CPU/RAM/PIDs por serviço |
| **Tema claro/escuro** | Persistido por preferência do usuário |
| **2FA (TOTP)** | Autenticação em dois fatores para a conta |
| **Templates** | Catálogo com 1-click deploy; redireciona para o serviço criado após instalação |
| **Duplicar serviço** | Clone de serviço com spec e env vars — ideal para ambientes staging/prod |
| **Histórico de deploys** | Paginado (anterior/próximo) com contagem total |
| **Status ao vivo** | Backend sincroniza status dos containers com Docker a cada 30s |
| **Rate limiting** | Proteção brute-force no login (10 tentativas/min por IP) |
| **Gerenciamento de usuários** | Painel completo para criar, editar papel/senha e remover contas (owner/admin) |

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

# Schema do banco (sem pasta prisma/migrations — aplica o schema.prisma direto)
npx prisma db push

# API
pm2 start ecosystem.config.cjs

# Deploy Worker (FastAPI/Python — operações de sistema/Docker)
cd deploy-worker
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cd ..
pm2 start deploy-worker/ecosystem.config.cjs

# Frontend (build de produção)
cd web && npm ci && npm run build
# Sirva web/dist com nginx
```

Acesse `http://localhost:8088` — crie sua conta na primeira vez.

---

## Variáveis de ambiente

Copie `.env.example` para `.env` e preencha:

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | `postgres://user:pass@host:5432/litedock` |
| `REDIS_URL` | `redis://localhost:6379` |
| `JWT_SECRET` | Segredo aleatório (mín. 32 chars — `openssl rand -hex 32`) |
| `ENCRYPTION_KEY` | Chave para AES-256-GCM (`openssl rand -hex 32`) |
| `PORT` | Porta da API (padrão: `8088`) |
| `PUBLIC_URL` | URL pública do painel com `/api` (ex: `https://painel.meudominio.com/api`) |
| `LITEDOCK_DOCKER_PROXY` | Endereço do docker-socket-proxy (padrão: `127.0.0.1:2375`) |
| `JWT_EXPIRES_IN` | Duração da sessão de login (padrão: `12h`) |
| `DEPLOY_WORKER_TOKEN` | Segredo compartilhado Node↔Deploy Worker — mesmo valor em `deploy-worker/.env` (`openssl rand -hex 32`) |

---

## Segurança por design

- **Sem segredo padrão** — `JWT_SECRET`/`ENCRYPTION_KEY` são obrigatórios; a API recusa subir sem eles configurados
- **Sessão com expiração + revogação** — JWT expira (`JWT_EXPIRES_IN`) e pode ser revogado antes disso (troca de senha, mudança de papel) sem esperar o token vencer
- **RBAC com isolamento por tenant** — owner/admin/member; cada usuário só vê/opera os próprios projetos e serviços, checado em toda rota (inclusive as que operam por nome de container Docker)
- **Docker Socket Proxy** — API do Docker exposta com superfície mínima (sem exec, sem swarm)
- **Label gate + rede por projeto** — só containers `litedock.managed=true` são controlados pelo painel; cada projeto tem rede Docker isolada, pontes são opt-in
- **Sem órfãos ao apagar projeto** — containers dos serviços e a rede do projeto são removidos antes do registro no banco; nada fica rodando/exposto sem aparecer no painel
- **AES-256-GCM** — variáveis de ambiente e credenciais (ex.: token de GitHub) criptografadas em repouso
- **Deploy Worker autenticado** — o worker Python (loopback) exige um segredo compartilhado, não confia só na topologia de rede
- **Limites por container** — CPU/RAM/PIDs configuráveis na GUI (proteção contra abuso)
- **no-new-privileges** — escalonamento de privilégio bloqueado em todos os deployments
- **JWT + 2FA TOTP** — autenticação segura com segundo fator opcional
- **bcrypt (fator 12), senha mínima de 10 caracteres** — hash forte com custo adequado

Políticas completas (senha, sessão/cookies, controle de acesso, rate
limiting, segredos, logging) em [`docs/security/`](docs/security/README.md).

---

## Contribuindo

PRs são bem-vindos! Leia o [**CONTRIBUTING.md**](CONTRIBUTING.md) para o guia completo de setup e padrões.
Encontrou uma vulnerabilidade? Veja a [**política de segurança**](SECURITY.md) — não abra issue pública.

1. Fork → branch → commits atômicos (1 arquivo por commit)
2. `npm run typecheck` na raiz + `cd web && npm run typecheck && npm run build`
3. Descreva o *porquê* da mudança no PR

---

## Licença

[PolyForm Shield 1.0.0](LICENSE) — use, modifique e rode livremente (inclusive em empresas).
A única restrição: não é permitido oferecer o LiteDock, nem uma versão modificada dele,
como produto ou serviço concorrente sem uma licença comercial. Fora isso, uso liberado.

---

<div align="center">
  Feito no Brasil 🇧🇷 &nbsp;·&nbsp; Inspirado no EasyPanel, construído do zero
</div>
