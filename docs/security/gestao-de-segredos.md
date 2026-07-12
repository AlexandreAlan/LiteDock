# Política de gestão de segredos

## Regra geral

**Nenhum segredo tem valor padrão utilizável em produção.** `src/config.ts`
falha o boot (`throw`) se `JWT_SECRET` ou `ENCRYPTION_KEY` estiverem ausentes
ou abaixo de 32 caracteres — antes tinham fallback (`'dev-secret-change-me'`,
`'dev-encryption-key-change-me-32bytes'`) que permitiria a API subir
"funcionando" com um segredo PREVISÍVEL e público (está no código-fonte no
GitHub). Isso bastava pra forjar JWT válido de qualquer usuário/role, ou
decifrar todo segredo em repouso. Corrigido: falha alto e rápido, com
mensagem apontando pra `.env.example`.

## Inventário de segredos

| Segredo | Onde vive | Gerado com | Usado por |
|---|---|---|---|
| `JWT_SECRET` | `.env` (raiz) | `openssl rand -hex 32` | Assinar/verificar JWT de sessão |
| `ENCRYPTION_KEY` | `.env` (raiz) | `openssl rand -hex 32` | AES-256-GCM de `EnvVar.value` e `Credential.token` (`src/lib/crypto.ts`) |
| `DEPLOY_WORKER_TOKEN` | `.env` (raiz) **e** `deploy-worker/.env` (mesmo valor nos dois) | `openssl rand -hex 32` | Autenticar chamadas Node→worker Python (loopback) |
| `DATABASE_URL` | `.env` (raiz) | — (senha do Postgres) | Prisma |
| Senha de usuário | Nunca em texto puro — só `User.passwordHash` (bcrypt) | — | Login |
| `EnvVar.value` (secrets de serviço) | Postgres, cifrado (AES-256-GCM) | Definido pelo tenant na GUI | Injetado no container no deploy |
| `Credential.token` (GitHub PAT) | Postgres, cifrado (AES-256-GCM) | Colado pelo tenant | Clonar repo privado |
| `Service.deployToken` | Postgres, texto puro (é ele mesmo um bearer token de uso único por serviço, não uma chave mestra) | `randomBytes(24).toString('hex')` | Autenticar webhook de CI/CD |

## Regras

1. **`.env` nunca é commitado.** `.gitignore` cobre `.env` (raiz e qualquer
   subdiretório, inclusive `deploy-worker/.env`) e `.env.bak-*`. Sempre
   confira `git status`/`git diff --staged` antes de commitar em área que
   mexeu em config — um `.env` commitado por engano é o pior tipo de
   vazamento (fica no histórico do Git pra sempre, mesmo removendo depois).
2. **`.env.example` documenta o QUE precisa existir, nunca um valor real.**
   Placeholders tipo `SUBSTITUA_POR_...` — nunca um segredo "de exemplo" que
   pareça válido o suficiente pra alguém esquecer de trocar.
3. **Segredo de tenant (env var de serviço, token de GitHub) é cifrado em
   repouso, nunca em trânsito sem TLS.** `encrypt()`/`decrypt()`
   (`src/lib/crypto.ts`, AES-256-GCM, IV aleatório por valor, chave derivada
   via `scryptSync(ENCRYPTION_KEY, salt-fixo, 32)`). Decifrado só no momento
   de uso (montar env do container, chamar API do GitHub) — nunca persistido
   decifrado.
4. **Resposta de API mascara segredo por padrão.** `GET /services/:id`
   devolve `envVars` com valor `••••••` quando `isSecret=true`; o valor real
   só sai por `GET /services/:id/env/:key/reveal`, uma chamada explícita e
   auditável (mesma checagem de ownership de todas as rotas de serviço).
5. **Segredo de tenant nunca aparece em log de deploy.** O clone Git (que
   pode ter o token injetado na URL pra repo privado) tem o token substituído
   por `***` em toda linha de log (`src/services/build.ts`,
   `authUrl()`/callback de log do `git clone`) antes de gravar no
   `Deployment.log` (que o próprio tenant lê pela GUI).
6. **Segredo compartilhado entre processos (worker) usa comparação em tempo
   constante.** `hmac.compare_digest` no Python (`deploy-worker/main.py`),
   `timingSafeEqual` no Node (webhook de deploy, `src/routes/webhooks.ts`) —
   nunca `===`/`==` puro pra comparar segredo, evita timing attack.
7. **Rotação**: `JWT_SECRET`/`ENCRYPTION_KEY` não têm rotação automatizada
   hoje — trocar `JWT_SECRET` invalida TODOS os tokens emitidos (equivalente
   a deslogar todo mundo, aceitável em incidente); trocar `ENCRYPTION_KEY`
   TORNA ILEGÍVEL todo segredo já cifrado no banco com a chave antiga (não
   fazer sem migrar os valores primeiro — reavaliar/decifrar com a chave
   velha e recifrar com a nova antes de trocar `.env`). Documentar aqui
   porque não há tooling pra isso ainda; se vira necessidade real (rotação
   por política, não só por incidente), construir uma migração dedicada.
