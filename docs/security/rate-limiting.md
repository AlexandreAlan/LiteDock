# Política de rate limiting

## Onde existe hoje

- **Login** (`POST /auth/login`, `src/routes/auth.ts`): limitador em memória
  por IP — máx. **10 tentativas/minuto**, janela deslizante simples (`Map<ip,
  {count, resetAt}>`). Excedeu → `429` com `Retry-After` implícito na
  mensagem. Detecta IP via `X-Forwarded-For` (primeiro da lista) com fallback
  pro socket — **assume que o LiteDock roda atrás de um proxy confiável**
  (nginx local); se a API ficar exposta diretamente à internet sem proxy na
  frente, este header pode ser forjado pelo próprio atacante pra burlar o
  limite (cada request "finge" vir de um IP diferente). Não mude a topologia
  de rede sem revisar este ponto.
- **Webhook de deploy** (`POST /webhooks/services/:id/deploy`): não tem rate
  limit dedicado, mas o token por si é a defesa (comparação em tempo
  constante, 24 bytes aleatórios) — força bruta no token não é viável antes
  de qualquer rate limit de rede genérico (nginx/fail2ban, fora do escopo
  desta app).

## Onde NÃO existe (limitação conhecida)

- **`POST /auth/register`** — só pode ser chamado com sucesso UMA vez (o
  1º usuário vira `owner`; depois disso todo mundo recebe 403 "cadastro
  fechado"). Isso significa que não há corrida de força bruta de senha
  contra ele (não adianta tentar 1000 e-mails), mas existe uma janela de
  corrida ENTRE o boot de uma instalação nova e o dono de fato criar a conta:
  se a API subir publicamente acessível antes do dono se cadastrar, qualquer
  visitante que chegue primeiro no `/auth/register` vira o `owner`. Mitigação
  recomendada pro instalador (fora do código): só expor a porta pública
  DEPOIS de criar a primeira conta, ou criar a conta a partir do próprio
  host antes de abrir a porta 443. Ver `docs/RELEASING.md`/README de
  instalação — candidato a virar um passo explícito do installer.
- **Criação de recursos por um usuário já autenticado** (novo projeto,
  serviço, deploy manual) — sem limite de "N criações por minuto". Hoje a
  defesa contra abuso é indireta: limites de CPU/RAM/PIDs por container
  (`config.deployMemMB/deployCpus/deployPidsLimit`, aplicados em
  `deployService()`), não limite de QUANTOS deploys/serviços um usuário cria.
  Um usuário malicioso já autenticado (ou com credenciais vazadas) pode
  tentar esgotar recursos do host criando muitos serviços — mitigado hoje só
  pelos limites por-container, não por quantidade. Se isso virar um vetor
  real (plano gratuito com muitos usuários, por exemplo), adicionar um teto
  de serviços/projetos por usuário é o próximo passo natural.
- **2FA** (`POST /auth/2fa/enable`) — validação de código TOTP não tem rate
  limit dedicado; como o endpoint exige JWT válido (já autenticado com
  senha), o custo de abuso é baixo (só o próprio dono da conta consegue
  chamar), mas um código de 6 dígitos tem só 1 milhão de combinações — se
  este endpoint ficar acessível sem rate limit e sem já exigir autenticação
  prévia no futuro, reavaliar.

## Convenção pra novo rate limit

Sempre em memória (`Map`), por IP, com janela fixa — mesmo padrão de
`auth.ts`. Não introduzir dependência de Redis só pra rate limit enquanto o
LiteDock rodar como processo único (`exec_mode: fork`, `instances: 1` no
`ecosystem.config.cjs`); reavaliar se/quando for multi-instância.
