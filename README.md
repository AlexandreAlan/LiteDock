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
| PATCH | `/auth/credentials` | troca e-mail/senha da conta (exige senha atual) |
| POST | `/auth/2fa/setup` | gera segredo TOTP + otpauth (QR) — ainda não ativa |
| POST | `/auth/2fa/enable` | confirma o código e liga o 2FA |
| POST | `/auth/2fa/disable` | desliga o 2FA (exige senha) |
| GET | `/settings` | configs gerais do painel (chave→valor) |
| PATCH | `/settings` | grava configs (domínios, e-mail SSL, marca, notificações…) |
| GET | `/users` | lista usuários (owner/admin) |
| POST | `/users` | cria usuário (owner/admin) |
| PATCH | `/users/:id` | altera nome/papel/senha |
| DELETE | `/users/:id` | remove usuário (protege o último owner) |
| POST | `/github/connect` | conecta conta GitHub via token (valida + cifra) |
| GET | `/github/status` | estado da conexão (revalida o token) |
| GET | `/github/repos` | lista repositórios da conta conectada |
| DELETE | `/github/disconnect` | desconecta a conta GitHub |
| GET | `/servers/local/system/df` | uso de disco do Docker (via worker) |
| GET | `/servers/local/system/worker` | saúde do worker Python |
| POST | `/servers/local/system/prune` | limpeza **segura** (dangling + containers litedock) |
| POST | `/servers/local/system/traefik/restart` | reinicia o Traefik |
| GET | `/servers/local/system/traefik/logs` | logs do Traefik |
| POST | `/servers/local/system/panel/restart` | reinicia o painel (pm2) |
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
| PATCH | `/services/:id` | atualiza config do serviço (spec: source/repo/imagem/porta) + nome |
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
> Em produção sobe via pm2 no loopback. **Em prod já roda com `SAFE_MODE=false`
> (deploys reais)** — o worker só mexe em containers/rede com prefixo/rótulo
> `litedock`, nunca nos outros projetos da VPS.

Além do deploy, o worker expõe **ações de sistema** (operação do host, em
Python): `GET /system/df`, `POST /system/prune` (limpeza **segura** — só
imagens dangling e containers `litedock-*`), `POST /system/traefik/restart`,
`GET /system/traefik/logs`, `POST /system/panel/restart`. O Node faz proxy
dessas rotas em `/servers/local/system/*`.

## Modo demonstração

**No ar:** https://demo.litedock.morenadoaco.com.br

Painel de exemplo para mostrar o LiteDock sem servidor, sem Docker e sem risco —
todas as chamadas de API são interceptadas e respondidas por um store em memória
(`web/src/lib/demo.ts`).

> Publicado como SPA estático em `/var/www/clientes-vendas/litedock-demo/dist`
> (vhost `demo.litedock.morenadoaco.com.br.conf`, SSL Let's Encrypt). Para
> atualizar: `cd web && npm run build:demo && sudo rsync -a --delete dist/
> /var/www/clientes-vendas/litedock-demo/dist/`.

```bash
cd web
npm run dev:demo        # dev em http://127.0.0.1:5180
# ou gerar o bundle estático:
npm run build:demo      # saída em web/dist — pode hospedar em qualquer lugar
```

Ativação (qualquer uma):

- build com `VITE_DEMO=1` (scripts `dev:demo` / `build:demo`);
- hostname começando com `demo.` (ex.: `demo.litedock.morenadoaco.com.br`);
- `?demo=1` na URL (fica salvo no navegador; `?demo=0` desliga).

No login aparece o botão **“Entrar na demonstração”** (qualquer credencial serve)
e uma faixa fixa avisa que os dados são fictícios. Inclui 3 projetos de exemplo,
deploy ao vivo com log de build simulado, loja de templates, monitor com
métricas que se movem e eventos de Docker.

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

- **v0.9.2 (ingress dos apps: endereço automático + HTTPS wildcard)** — todo app
  implantado agora **abre sozinho** num endereço próprio com SSL, sem passo manual.
  - **Endereço aleatório e único por serviço.** App sem domínio ganha, no 1º deploy,
    um subdomínio aleatório sob o "Domínio dos serviços" (`*.litedock.morenadoaco.com.br`),
    ex.: `forte-aguia-76e2.litedock.morenadoaco.com.br`. Multi-tenant: o nome é
    checado contra colisão e regerado se ocupado (`src/services/naming.ts`).
  - **Cadeia de ingress.** DNS wildcard (Hostinger) → **nginx** termina o TLS com um
    **cert wildcard** (`*.litedock...`, via certbot **DNS-01** Hostinger, renova
    sozinho) → proxy HTTP pro **Traefik** (loopback) → container. O Traefik fica
    HTTP-only; o nginx faz o HTTPS. Qualquer subdomínio novo já nasce com SSL válido.
  - **Nome específico** continua opt-in (aba Domains do serviço); como o cert é
    wildcard, qualquer `<nome>.litedock...` escolhido já tem HTTPS.
- **v0.9.1 (Docker Socket Proxy + graceful shutdown + launch correto)** — três
  melhorias de segurança/resiliência:
  - **Docker Socket Proxy (Tecnativa).** O Node (dockerode) e o worker Python
    falam com a Engine por um proxy de **superfície mínima** (`docker-compose.socket-proxy.yml`,
    loopback `127.0.0.1:2375`) em vez do socket cru. Liberado só o que o LiteDock
    usa (containers/networks/images + info/version/events/ping); **bloqueado**
    `exec`, `secrets`, `swarm`, `nodes`, `services`, `plugins`, `build`, `volumes`
    (todos → 403, validados). Ligado por toggle: API via `LITEDOCK_DOCKER_PROXY`
    no `.env`; worker via `DOCKER_HOST=tcp://proxy`. O **build** (que o proxy
    bloqueia de propósito) sempre usa o **socket real** via `DOCKER_REAL_SOCKET`.
    Roteamento confirmado nos access logs do proxy. *Ressalva honesta:* o proxy
    filtra por área+método, **não por path/label** — não protege os outros
    containers de produção de um LiteDock comprometido (isso exigiria daemon/VPS
    separados ou authz plugin); ele mata a superfície catastrófica (exec/secrets/
    swarm).
  - **Graceful shutdown de deploys.** Reconciliação em duas camadas: no **boot**
    (cobre até crash duro) e no **encerramento por sinal** (SIGTERM/SIGINT) — marca
    deploys presos (`queued/building/deploying`) como `failed` e remove containers
    temporários `*__deploy-*` órfãos do blue-green.
  - **Launch como processo único (correção de raiz).** O pm2 rodava `npm run start`
    (→ `npm → tsx → node`); o `npm` **não repassava o sinal**, então o graceful
    shutdown nunca recebia SIGINT — e, pior, processos `node` netos ficavam
    **órfãos segurando a porta 8088 com código antigo** enquanto o processo
    gerenciado entrava em crash-loop por `EADDRINUSE`. Agora a API roda como
    **processo único** via `ecosystem.config.cjs` (`node --import tsx src/server.ts`,
    `kill_timeout: 12000`), o sinal chega direto no handler e não há mais órfãos.
    `pm2 save` persiste pra sobreviver a reboot da VPS.
- **v0.9.0 (build portátil + isolamento do control-plane)** — duas frentes de
  estabilidade/infra:
  - **Nixpacks conteinerizado (portabilidade).** O build de código sem
    Dockerfile não exige mais o `nixpacks` instalado no host. O worker Python
    roda o nixpacks dentro de um **container efêmero** (imagem
    `litedock/nixpacks-builder`: nixpacks CLI + docker CLI + buildx),
    montando o `docker.sock` pra gerar a imagem no Docker Engine do host. A
    imagem builder é construída sob demanda na 1ª vez. Resultado: a **única
    dependência do painel volta a ser o Docker**. Logs do build seguem em
    streaming (linha a linha) pro log do deploy. Novo endpoint
    `POST /build/nixpacks` no worker (respeita `SAFE_MODE`).
  - **Isolamento do control-plane.** Postgres/Redis do painel agora numa rede
    Docker dedicada **`litedock_internal`** (só o control-plane entra), com as
    portas ainda **só no loopback**. Apps de cliente continuam em
    `litedock-net-<projeto>` e **não enxergam** o banco/estado do painel
    (verificado: container de cliente não resolve `litedock-pg`). Mantido o
    modelo de **uma rede por projeto + Traefik fazendo só o ingress** — mais
    isolante que uma rede de apps compartilhada (projetos não se cruzam).
- **v0.9.0 (deploy real dos templates)** — instalar um template agora **sobe
  sozinho** (auto-deploy: banco primeiro, app em seguida). O deploy passou a
  suportar **serviços de banco** (imagem derivada da engine), **volumes
  nomeados** (dados persistem no redeploy) e **alias de rede** = nome do serviço
  (o app resolve o banco por DNS, ex.: `meuapp-db`). Imagem vem do template; só
  fica vazia em origem personalizada (Git).
- **v0.9.0 (loja)** — **Catálogo com ~105 ferramentas** (antes 22), com o
  **logotipo oficial** de cada uma (CDN dashboard-icons; cai pra inicial se a
  imagem faltar — chega de emoji em ferramenta profissional). Organizado em 11
  categorias (Banco de dados, CMS & Blog, Automação & No-code, Analytics & BI,
  Monitoramento, Dev & Git, Segurança & Senhas, Comunicação, Produtividade &
  Cloud, Mídia, Ferramentas), tudo no mesmo catálogo com busca + filtros.
- **v0.9.0** — **Isolamento de rede por projeto + pontes opt-in**. Cada projeto
  ganha sua própria rede Docker (`litedock-net-<slug>`); os serviços de um
  projeto se enxergam, mas **projetos diferentes ficam isolados** — só se falam
  se você criar uma **ponte** (botão *Redes* no projeto). A automação de rede
  roda no **worker Python** (`/network/{ensure,bridge,connect,disconnect}`):
  cria a rede, pluga o Traefik e religa os containers ao fazer/desfazer ponte.
  O deploy (Node) sobe o container já na rede isolada + redes das pontes ativas,
  com label `traefik.docker.network`. Modelo `ProjectBridge` + rotas
  `/projects/:id/bridges`.
- **v0.8.1** — **Conexão GitHub** (aba Github dos Ajustes) funcional via Personal
  Access Token: o painel valida o token na API do GitHub, mostra usuário/avatar,
  guarda **cifrado** (AES-256-GCM, modelo `Credential` kind=`github`) e lista os
  repositórios. Na aba **Source** de cada serviço aparece um **dropdown de
  repositórios** que preenche URL/branch/credencial num clique — deploy de repo
  privado e build por push ficam fáceis. Rotas `/github/{connect,status,repos,disconnect}`.
- **v0.8.0** — **Ajustes 100% funcionais** (nada de stub):
  - **2FA (TOTP)** real, sem dependências no backend (`src/lib/totp.ts`,
    RFC 6238): QR via `qrcode` no front, ativar/desativar e **login passa a
    exigir o código** quando ligado.
  - **Usuários**: CRUD completo (`/users`) com papéis (owner/admin/member),
    proteções (não excluir a si mesmo nem o último owner).
  - **Ações de sistema no worker Python** (não em TS): limpeza **segura** do
    Docker (só imagens dangling + containers `litedock-*`, nunca prune global
    — a VPS é compartilhada com várias apps), `df`, reiniciar/ver logs do
    Traefik, reiniciar o painel. Geral passou a chamar essas ações de verdade.
    **Limpeza diária** agendada (04:00) no scheduler do Node quando ligada.
  - Abas **Monitoring / Análise / Cluster / Certificados** mostram dados reais;
    **Marca** (nome + logo aplicados no painel) e **Notificações** persistidas.
  - **Deploys reais ligados**: `SAFE_MODE=false` no worker (escopado só a
    containers/rede `litedock`).
- **v0.7.1** — Aba **Geral** dos Ajustes no estilo "General" do EasyPanel: barra
  de ações (menus **Painel / Servidor / Traefik / Docker** + toggle **Limpeza
  diária do Docker**) com tempo de atividade real, e os cards **Domínio do
  painel**, **Domínio dos serviços** (com dica de DNS curinga) e **E-mail do
  Let's Encrypt**. As configs são persistidas de verdade num store chave-valor
  (modelo `Setting` + **`GET`/`PATCH /settings`**). Os menus de ação
  (reiniciar/limpar) ainda são placeholders por segurança no servidor real.
- **v0.7.0** — Página **Ajustes** repaginada no estilo do EasyPanel: layout de
  duas colunas com sub-navegação (grupos **Usuário** e **Servidor**). A aba
  padrão **Autenticação** traz os cards **Mudar credenciais** (e-mail, senha
  atual, nova senha — com mostrar/ocultar) e **Autenticação de dois fatores**.
  Troca de credenciais é real: novo endpoint **`PATCH /auth/credentials`**
  (autenticado, exige a senha atual, devolve um JWT novo). A aba **Geral**
  reúne as informações de servidor/conta/sobre que antes ficavam soltas; as
  demais abas ficam como "em construção". 2FA por enquanto é só visual.
- **v0.6.2** — Limpeza da barra lateral: removidos os links **Discord** e
  **Comentários** do rodapé de navegação (`web/src/components/Layout.tsx`).
  Sobram **Documentação** e **Registro de alterações**.
- **v0.6.1** — **Modo demonstração**: build estático (`npm run build:demo`) que
  serve um painel de exemplo com dados fictícios, sem backend e sem tocar em
  nenhum container/produção. Toda a UI funciona (projetos, serviços, deploy ao
  vivo com log progressivo, templates, monitor, métricas). Ver seção
  [Modo demonstração](#modo-demonstração).
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
