# Política de controle de acesso

## Modelo de papéis (RBAC)

Três papéis, definidos em `prisma/schema.prisma` (`User.role`) e centralizados
em `src/lib/rbac.ts`:

| Papel | Pode |
|---|---|
| `owner` | Tudo. Único papel que abre terminal real do host (`/terminal/ws`), promove/rebaixa outro usuário para/de `owner`, e não pode ser excluído se for o último. |
| `admin` | Administra usuários (exceto promover a/mexer em `owner`), e tudo que toca o HOST como um todo — não escopado a um tenant: PM2 (`src/routes/pm2.ts`), ferramentas de sistema (`src/routes/tools.ts`), DevSpace (`src/routes/devspace.ts`), Studio/IDE (`src/routes/studio.ts`), visão/ações de VPS que cruzam tenants (`src/routes/servers.ts`, endpoints `/local/system/*`, `/local/containers` sem nome, `/local/metrics`, etc.). |
| `member` | Só os PRÓPRIOS projetos/serviços — tudo em `src/routes/services.ts`, `projects.ts`, `domains.ts`, `activity.ts`, `templates.ts`, `github.ts` é filtrado por `ownerId: req.user.sub` em toda query. |

`src/lib/rbac.ts` é o ÚNICO ponto de verdade pra essa checagem — `requireAdmin`/
`requireOwner` (uso dentro de handler) e `requireAdminHook`/`requireOwnerHook`
(uso como `onRequest`, roda ANTES do handler — obrigatório pra rotas que fazem
upgrade de WebSocket ou qualquer side-effect que não dá pra desfazer depois de
já ter começado, ex.: `terminal.ts` abre um PTY real). **Não duplicar essa
lógica em rotas novas** — importar de `lib/rbac.ts`.

### Promoção a `owner`

Só um `owner` pode criar ou promover outro usuário a `owner` — checado tanto
na criação (`POST /users`) quanto na edição (`PATCH /users/:id`). As duas
checagens existem porque são vetores diferentes: a de criação impede um admin
de criar um owner novo; a de edição impede um admin de promover um `member`/
`admin` já existente (ou a SI MESMO) a `owner`. Se só uma existisse, a outra
seria um bypass — mantenha as duas em qualquer refatoração.

## Isolamento entre tenants (multi-tenant)

O LiteDock é multi-tenant no sentido "vários usuários administram os PRÓPRIOS
projetos no mesmo painel/host compartilhado" — não são VMs/containers
isolados por cliente, é isolamento por ownership no banco + rede Docker.

- **Nível de dados**: toda query de recurso "de tenant" (`Project`, `Service`,
  `Domain`, `EnvVar`, `Deployment`, `Credential`) filtra por
  `project.ownerId === req.user.sub` (ver `loadOwned()` em `services.ts` como
  padrão de referência). Um `member` NUNCA vê/edita recurso de outro usuário
  por essas rotas.
- **Nível de rede**: cada projeto tem sua própria rede Docker isolada
  (`litedock-net-<slug>`, `src/services/deploy.ts` `projectNetwork()`) —
  containers de projetos diferentes não se enxergam por padrão. Pontes
  (`ProjectBridge`) são opt-in e só entre projetos do MESMO dono
  (`src/routes/projects.ts`, checagem `ownerId` nos dois lados antes de criar
  a ponte).
- **Nível de host (containers "crus" fora do modelo de Service)**:
  `src/routes/servers.ts` (`/servers/local/containers/:name/*`) opera
  diretamente por NOME de container Docker, sem passar pelo modelo
  `Service`/`Project` — usado tanto pelas telas de administração (Vps.tsx,
  Overview.tsx, admin-only) quanto pela tela de um serviço específico
  (Service.tsx, `member` agendando liga/desliga do PRÓPRIO container).
  Regra aplicada (`assertContainerAccess` em `servers.ts`): `owner`/`admin`
  agem sobre qualquer container; um `member` só sobre um container que seja
  `Service.containerId` de um `Service` cujo projeto é dele. Os endpoints que
  NÃO são por-container (listar todos os containers do host, métricas do
  host, prune, restart do Traefik/painel) são só `owner`/`admin` — vazariam
  nomes/imagens de containers de OUTROS tenants pra qualquer `member` logado.
- **Nível de domínio (Traefik)**: `Domain.host` é `@unique` no banco — dois
  serviços (de tenants diferentes ou não) nunca roteiam pro mesmo host. Hosts
  do control plane (domínio do próprio painel, `studio.<domínio-base>`, o
  domínio-base "nu") são reservados — um tenant não consegue cadastrar um
  `Domain` que sequestre o tráfego do painel (`assertNotReservedHost` em
  `services.ts`).
- **Build a partir de Git**: o contexto de build (`spec.subdir`) e o
  `Dockerfile` (`spec.dockerfile`) informados pelo tenant são resolvidos e
  CONTIDOS dentro do diretório do checkout temporário (`src/services/build.ts`,
  `safeJoin()`) — sem isso, um tenant poderia usar `../../` pra fazer o
  `docker build` ler arquivos arbitrários do host (inclusive de OUTROS
  tenants) e empacotá-los na própria imagem.

## Deploy worker (Python) — trust boundary extra

O worker (`deploy-worker/main.py`, FastAPI em loopback) executa ações
diretamente no Docker Engine do host a pedido do Node (build, prune, restart
do Traefik/painel, redes). Ele NÃO reimplementa o RBAC do LiteDock — confia
que só o processo Node autenticado (via `DEPLOY_WORKER_TOKEN`, ver
[`gestao-de-segredos.md`](./gestao-de-segredos.md)) fala com ele. Isso é
aceitável porque o RBAC já foi aplicado uma camada antes (nas rotas Node que
chamam o worker) — o token existe pra impedir que OUTRO processo da mesma VPS
(de outro produto) fale com o worker diretamente e pule essa checagem, não
pra reimplementar RBAC por-tenant dentro do worker.
