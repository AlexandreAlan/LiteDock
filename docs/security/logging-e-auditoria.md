# Política de logging e auditoria

## O que logar

- **Requisições HTTP** (Fastify/pino, `src/server.ts`): método, path, status,
  tempo de resposta, IP. Nível `info`, sem transporte custom (JSON
  estruturado direto no stdout do pm2).
- **Deploys** (`Deployment.log`, Postgres): log de build/deploy linha a
  linha, visível na GUI pro dono do serviço — é auditoria funcional (o tenant
  vê o que aconteceu no próprio deploy), não log de sistema.
- **Reconciliação de deploys interrompidos** (`src/services/deploy.ts`,
  `reconcileInterruptedDeploys`): registrado tanto no log da aplicação
  (`console.log`) quanto no próprio `Deployment.log` do serviço afetado —
  dá rastro de "por que esse deploy falhou" mesmo quando a causa foi a API
  reiniciando, não o código do tenant.
- **Eventos do Docker** (`src/services/monitor.ts`, buffer em memória, 200
  últimos): start/stop/die/etc. de qualquer container do host — alimenta a
  tela de Monitor (admin-only).
- **Avisos de segurança no boot**: worker Python loga um `warning` se subir
  sem `DEPLOY_WORKER_TOKEN` configurado (`deploy-worker/main.py`) — visível
  no `pm2 logs litedock-deploy-worker`.

## O que NUNCA logar

- **Senha em qualquer forma** (texto puro, hash, `currentPassword`/
  `newPassword` do body) — nem em log de request (Fastify por padrão não
  loga o body inteiro; não adicionar um hook que passe a logar `req.body`
  sem antes auditar todo endpoint que recebe segredo).
- **Segredo de tenant decifrado** (`EnvVar.value` de serviço, token de
  GitHub) — `decrypt()` só é chamado no exato ponto de uso (montar env do
  container, chamar a API do GitHub); o valor decifrado nunca é passado pra
  `console.log`/`app.log`/`onLog()` de deploy.
- **Token de repositório Git privado** — mascarado (`***`) em toda linha de
  log do `git clone` antes de gravar no `Deployment.log` (ver
  [`gestao-de-segredos.md`](./gestao-de-segredos.md), item 5).
- **JWT completo** — nem em log de erro nem em log de acesso. Se precisar
  depurar auth, logar `sub`/`email` do payload já verificado, nunca o token
  bruto.
- **`DEPLOY_WORKER_TOKEN`/`JWT_SECRET`/`ENCRYPTION_KEY`** — nem no boot, nem
  em erro de configuração. As mensagens de erro do `requireSecret()`
  (`src/config.ts`) citam o NOME da variável ausente, nunca um valor.
- **PII de tenant sem necessidade operacional clara** — hoje o LiteDock não
  registra analytics/telemetria de uso por usuário além do necessário pra
  operar (e-mail no JWT payload, nome/e-mail nas telas de gestão de
  usuários). Se uma feature futura precisar logar dado de tenant (ex.: para
  suporte), considerar redação por padrão e um flag explícito de opt-in —
  ver `docs/security/README.md` sobre manter este documento atualizado ao
  adicionar qualquer nova fonte de log.

## Retenção

- **Logs de aplicação** (pm2): não há rotação/retenção configurada pelo
  LiteDock em si — depende da configuração de `pm2-logrotate` (ou
  equivalente) do host. Fora do escopo deste repositório, mas documentado
  aqui porque log sem rotação em disco compartilhado é um vetor de DoS por
  esgotamento de disco (ver `deployPidsLimit`/limites de recurso por
  container — a mesma preocupação vale pro processo do próprio painel).
- **`Deployment.log`**: cresce com o histórico de deploys, sem purga
  automática hoje. Se o volume de deploys crescer muito por instalação,
  considerar truncar/arquivar deployments antigos (não é uma questão de
  segurança isolada, mas de higiene operacional que pode virar uma se o
  banco ficar grande o suficiente pra afetar disponibilidade).

## Auditoria de quem fez o quê

Hoje a trilha de auditoria é implícita, não uma tabela `AuditLog` dedicada:
`Deployment.trigger` (`manual|webhook|api`) + `Deployment.startedAt` dão
rastro de deploy; não há registro formal de "quem alterou o quê" fora disso
(ex.: quem mudou uma env var, quem promoveu um usuário a admin). Se um
requisito de compliance exigir trilha de auditoria completa (comum em
clientes enterprise), este é o próximo investimento natural: uma tabela
`AuditLog(actorId, action, targetType, targetId, at, meta)` populada nos
pontos sensíveis já mapeados neste documento (troca de papel, exclusão de
usuário/projeto, revelação de segredo, criação/rotação de webhook).
