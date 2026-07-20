# Changelog

Todas as mudanças notáveis do LiteDock são documentadas aqui.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

## [Não lançado]

Auditoria de segurança completa do control-plane + leva grande de funcionalidades novas.

### Segurança
- RBAC centralizado (`requireAdmin`/`requireOwner`) aplicado a todas as rotas sensíveis
- Elimina injeção de comando em `tools.ts` e `pm2.ts`
- Terminal real (PTY do host) e DevSpace restritos a owner/admin
- JWT com `tokenVersion` — expira e é revogável; troca de senha ou de papel invalida sessões na hora
- Remove fallback inseguro de `JWT_SECRET`/`ENCRYPTION_KEY` — API recusa subir sem eles configurados
- Senha mínima de 10 caracteres, bcrypt fator 12
- Corrige controle de acesso quebrado em `/servers/local/*`
- Bloqueia tenant de reivindicar domínio do próprio painel
- `git clone` restrito a `https://` via `GIT_ALLOW_PROTOCOL`
- Build contém `spec.subdir`/`spec.dockerfile` dentro do checkout, sem escapar do diretório
- Chamadas Node → Deploy Worker (Python) autenticadas por segredo compartilhado (`DEPLOY_WORKER_TOKEN`)
- Fecha escalonamento de privilégio via `PATCH /users/:id`
- Fecha corrida de registro do owner de bootstrap
- Senha no Redis interno + tag do docker-socket-proxy fixada por digest
- `DELETE /projects/:id` remove containers e rede do projeto antes de apagar o registro — sem órfãos
- Políticas de segurança formalizadas e publicadas em [`docs/security/`](docs/security/README.md) (senhas, sessão/cookies, RBAC, rate limiting, segredos, logging)

### Funcionalidades
- **Terminal** real (PTY) no navegador via `node-pty` + `xterm.js`
- **Studio** — VS Code completo embutido (openvscode-server), sessão por cookie, sem subdomínio separado
- **PM2** — página de gerenciamento completo de processos (start/stop/restart/logs/delete)
- **Ferramentas** — Port Map, Disk Usage, Env Editor e Cron Jobs
- **Health Monitor** — pinga todos os serviços HTTP e mostra status + latência em tempo real
- **Visão Geral** — snapshot unificado PM2 + Docker, com importação em massa para o LiteDock
- **Publish Wizard** — publica um projeto em 4 passos direto da página Projects
- **Atividade** — histórico de deploys com filtros e estatísticas
- **Drag-and-drop** — reordenar projetos e mover serviços entre projetos
- **Templates** — credenciais geradas exibidas com cópia 1-click após o install
- **Logo oficial** (SVG)
- **Imagem Docker no ghcr.io** — publicada automaticamente a cada push via CI

### Licenciamento
- Troca de MIT para **PolyForm Shield 1.0.0** — uso e modificação livres (inclusive em empresas); a única restrição é oferecer o LiteDock, ou uma versão modificada dele, como produto ou serviço concorrente sem licença comercial

## [v0.9.2] — 2026-06-26

### Funcionalidades
- Gerenciamento de usuários — página `/users` completa (criar, editar papel/senha, remover), visível só para owner/admin

### CI/CD
- GitHub Actions — typecheck de API e frontend em todo push/PR
- Badge de CI ao vivo no README

### Segurança
- bcrypt fator 12 (antes 10) em todos os fluxos de senha
- Headers de segurança HTTP (`X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy`)

### Performance
- 11 índices no PostgreSQL nas FKs principais + índice composto em `Deployment`

### UX
- Reveal e edição inline de env vars; exportar `.env`
- Notificações Discord/Slack via webhook
- Duplicar serviço; histórico de deploys paginado
- Mini-barras de CPU/RAM/Disco na sidebar com alerta de cor

## [v0.9.1] — 2026-06-24

### Segurança
- Docker Socket Proxy (Tecnativa) — Node e worker Python passam a falar com a Docker Engine por um proxy de superfície mínima, não pelo socket cru; `exec`/`secrets`/`swarm`/`nodes` bloqueados

### Resiliência
- Graceful shutdown de deploys — reconciliação no boot e no encerramento por sinal; deploys presos viram `failed`, containers órfãos do blue-green são removidos
- Correção de raiz do launch: API roda como processo único via `ecosystem.config.cjs`, eliminando o crash-loop por `EADDRINUSE` causado pelo `npm` engolindo sinais
