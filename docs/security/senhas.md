# Política de senhas

## Requisitos mínimos

- **Comprimento mínimo: 10 caracteres.** Aplicado no schema Zod de todo
  endpoint que recebe senha — registro (`src/routes/auth.ts`, `POST /auth/register`),
  troca de credenciais (`PATCH /auth/credentials`) e gestão de usuários por
  admin (`src/routes/users.ts`, `POST/PATCH /users`). Constante `PASSWORD_MIN`
  em cada arquivo (não duplicar o número mágico — se subir o mínimo, subir
  nos dois lugares).
- Não há teto de comprimento imposto pela aplicação (bcrypt trunca em 72
  bytes — comportamento aceito, documentado aqui pra não surpreender ninguém).
- **Sem exigência de complexidade (maiúscula/símbolo/etc.)** — comprimento é
  o fator dominante contra ataque de força bruta offline; regras de
  complexidade tendem a produzir senhas previsíveis (`Senha123!`) sem ganho
  real de entropia. Se decidirmos endurecer, o próximo passo recomendado é
  checagem contra lista de senhas vazadas (ex.: k-anonimato do
  Have I Been Pwned), não regra de composição.

## Hashing

- **bcrypt, fator de custo 12** (`bcryptjs`, `bcrypt.hash(password, 12)`) —
  usado em `auth.ts` (registro, troca de senha) e `users.ts` (criação/edição
  de usuário por admin). Custo 12 é o piso recomendado atual para bcrypt em
  hardware de servidor comum; reavaliar se o hardware mudar
  significativamente (mais rápido = custo devia subir).
- **Nunca** armazenar senha em texto puro, nem em log, nem em `Deployment.log`
  (o texto de log de build/deploy nunca deveria conter isso, mas vale o
  lembrete: não passar `password`/`currentPassword`/`newPassword` pra
  nenhuma função de log).
- Comparação sempre via `bcrypt.compare` (tempo constante do próprio bcrypt),
  nunca `===` entre hash e valor.

## Fluxo de troca de senha

- **Auto-serviço** (`PATCH /auth/credentials`): exige `currentPassword`
  correta antes de aceitar `newPassword`. Ao trocar, incrementa
  `User.tokenVersion` — revoga qualquer OUTRA sessão/token já emitido (ver
  [`sessao-e-cookies.md`](./sessao-e-cookies.md)) e devolve um token novo pra
  sessão atual continuar sem precisar logar de novo.
- **Por admin** (`PATCH /users/:id`): não exige a senha atual do alvo (é
  ação administrativa), mas também incrementa `tokenVersion` do alvo — a
  troca de senha por um admin derruba qualquer sessão que o usuário já
  tivesse aberta, forçando novo login com a senha nova.
- **2FA/TOTP** (`src/lib/totp.ts`): opcional, RFC 6238 padrão (SHA1, 6
  dígitos, janela ±1 período de 30s). Desligar o 2FA (`POST /auth/2fa/disable`)
  exige a senha atual — não é uma troca de "esqueci a senha" disfarçada.

## Não existe (ainda) — decisão de produto pendente

- **Fluxo de "esqueci minha senha" por e-mail.** Hoje a recuperação depende
  de um admin resetar a senha do usuário (`PATCH /users/:id`). Se/quando um
  fluxo de reset por e-mail for implementado, o token de reset precisa: ser
  de uso único, expirar em minutos (não horas), invalidar ao ser usado, e
  **não** revelar se o e-mail existe ou não na resposta (evita enumeração de
  contas).
- **Bloqueio de conta após N tentativas erradas.** Hoje o rate limit de
  login é por IP (ver [`rate-limiting.md`](./rate-limiting.md)), não por
  conta — um atacante distribuído (múltiplos IPs) não é freado por conta
  individual. Bloqueio por conta é mitigação adicional, mas também abre
  vetor de negação de serviço (travar a conta de outra pessoa só sabendo o
  e-mail); qualquer implementação futura deveria vir com CAPTCHA ou atraso
  progressivo, não bloqueio binário.
