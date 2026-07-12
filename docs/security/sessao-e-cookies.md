# Política de sessão e cookies

O LiteDock tem DOIS mecanismos de sessão, com propósitos diferentes — não
confundir um com o outro:

1. **Sessão principal (painel)** — JWT (`@fastify/jwt`), enviado como
   `Authorization: Bearer <token>`, guardado no `localStorage` do navegador
   (`web/src/lib/api.ts`). Autentica toda a API (`/api/*`).
2. **Sessão do Studio (IDE interno)** — cookie `studio_session`, HttpOnly,
   valida acesso ao code-server via `auth_request` do nginx.

## JWT do painel

- **Emissão**: `app.jwt.sign({ sub, email, role, tv }, ...)` em
  `src/routes/auth.ts` (registro, login, troca de credenciais). `tv`
  (tokenVersion) é o valor de `User.tokenVersion` no momento da emissão.
- **Duração**: `JWT_EXPIRES_IN` (padrão `12h`, `src/config.ts` →
  `@fastify/jwt` `sign.expiresIn` em `src/server.ts`). Depois disso o token
  para de ser aceito e o usuário precisa logar de novo — um token vazado
  (ex.: XSS, já que fica em `localStorage` e não em cookie HttpOnly) não vale
  pra sempre.
- **Revogação antes da expiração**: o decorator `app.authenticate`
  (`src/server.ts`) verifica, a CADA requisição autenticada, se
  `User.tokenVersion` no banco ainda bate com o `tv` embutido no token. Se
  divergir → 401, mesmo que o JWT ainda não tenha expirado. `tokenVersion` é
  incrementado quando:
  - o próprio usuário troca a senha (`PATCH /auth/credentials`);
  - um admin troca a senha OU o papel de outro usuário (`PATCH /users/:id`)
    — rebaixar alguém de `admin` pra `member` invalida a sessão antiga dele
    na hora, em vez de esperar o JWT expirar com o papel velho embutido.
- **Papel sempre fresco**: o mesmo decorator relê `User.role` do banco a
  cada requisição e sobrescreve `req.user.role` — o valor do JWT nunca é a
  fonte de verdade pro RBAC em tempo de execução, só serve pra identificar
  QUEM está falando (`sub`). Isso fecha a janela onde um admin rebaixado
  continuaria agindo como admin até o token expirar.
- **Onde guardar no cliente**: hoje `localStorage` (não é cookie — CSRF
  clássico não se aplica à API principal, já que não há credencial ambiente
  enviada automaticamente pelo browser). A troca por XSS é o risco real:
  qualquer XSS no frontend rouba o token. Mitigado por: React escapando
  output por padrão (sem `dangerouslySetInnerHTML` em uso — auditado), CSP
  na resposta (`X-Content-Type-Options`, `X-Frame-Options: DENY`,
  `Referrer-Policy`), e agora expiração+revogação. Se o frontend crescer em
  complexidade (ex.: renderizar HTML de terceiro, markdown de usuário),
  reavaliar mover pra cookie HttpOnly + CSRF token — trade-off documentado
  aqui pra decisão futura.
- **Logout**: o cliente descarta o token (`setToken(null)`); não há
  blacklist de token individual — para revogar de fato ANTES da expiração,
  use a troca de senha (bump de `tokenVersion`) ou peça a um admin pra
  editar o usuário (mesmo efeito).

## Cookie do Studio (`studio_session`)

- **Emitido por**: `POST /studio/session` (`src/routes/studio.ts`), só
  acessível a `owner`/`admin` (`requireAdminHook`) — o Studio dá acesso a um
  IDE completo (code-server) com shell real.
- **Flags**: `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=14400` (4h).
  - `HttpOnly` — inacessível a JS, não pode ser roubado por XSS no painel.
  - `Secure` — só trafega em HTTPS.
  - `SameSite=Lax` — não vai em requisições cross-site de terceiros
    (proteção CSRF de baixo custo pra este cookie).
  - **Sem atributo `Domain`** — cookie *host-only*: só volta pro MESMO host
    que o emitiu (`litedock.morenadoaco.com.br`, porta 8443 —
    `nginx/sites-available/litedock-ide.conf`). Antes usava
    `Domain=.litedock.morenadoaco.com.br`, que também enviava o cookie pros
    subdomínios de TENANT (`svc-xxxx.litedock...`) — um tenant malicioso
    conseguiria capturar a sessão do Studio passivamente e reenviá-la pro
    `/verify`. Fechado.
- **Validação**: nginx faz `auth_request` contra `GET /studio/verify`
  (loopback, `127.0.0.1:8088`) antes de proxiar pro code-server. Resposta
  401 vira 404 genérico no nginx (`error_page 401 =404`) — não revela pra
  quem não está autenticado que o Studio existe.
- **Sessões em memória** (`Map` no processo Node, não no Postgres) — reinício
  da API derruba todas as sessões do Studio (aceitável: reabrir é 1 clique,
  o custo de persistir em banco não compensa pra essa superfície).

## CSRF

- **API principal**: não aplicável na prática — autenticação é Bearer token
  em header explícito (não cookie), então não há credencial ambiente que um
  site de terceiro consiga anexar automaticamente numa requisição
  cross-site. CORS está com `origin: true` mas **sem** `credentials: true`
  (`src/server.ts`) — navegador não envia/expõe cookies em requisições
  cross-origin mesmo assim.
- **Cookie do Studio**: `SameSite=Lax` cobre a maioria dos casos (POST
  cross-site não leva o cookie); o cookie também só é útil combinado com o
  JWT (que o iframe do Forge já carrega via `postMessage`/mesma origem do
  painel), então uma ação puramente CSRF contra `/studio/verify` (só leitura,
  sem side-effect) não tem o que explorar.
