# Políticas de segurança do LiteDock

Este diretório documenta, formalmente, as políticas de segurança que o
código do LiteDock (control plane Node/Fastify/Prisma + deploy worker
Python/FastAPI) implementa. Cada arquivo cobre uma área e aponta pro trecho
de código que a aplica — se o código mudar, este documento tem que
acompanhar (é parte da definição de "pronto" de qualquer PR que toque
autenticação, RBAC, segredos ou dados de tenant).

Postura padrão do projeto: **zero trust / secure by design**. Todo input
externo (tenant, webhook, repositório Git de terceiro) é tratado como hostil
até prova em contrário; toda superfície que toca o host (Docker, PM2,
terminal, filesystem) exige o papel mínimo necessário (RBAC) e é auditável.

## Índice

| Documento | Cobre |
|---|---|
| [`senhas.md`](./senhas.md) | Requisitos mínimos, hashing (bcrypt), fluxo de troca |
| [`sessao-e-cookies.md`](./sessao-e-cookies.md) | JWT (duração, revogação), cookie do Studio, CSRF |
| [`controle-de-acesso.md`](./controle-de-acesso.md) | RBAC (owner/admin/member), isolamento entre tenants |
| [`rate-limiting.md`](./rate-limiting.md) | Onde existe, onde falta, limites atuais |
| [`gestao-de-segredos.md`](./gestao-de-segredos.md) | Segredos em repouso/trânsito, `.env`, cifragem |
| [`logging-e-auditoria.md`](./logging-e-auditoria.md) | O que logar, o que NUNCA logar (PII/segredos) |

## Reportar uma vulnerabilidade

Veja [`../../SECURITY.md`](../../SECURITY.md) — não abra issue pública.
