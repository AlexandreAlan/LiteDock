# Política de Segurança

## Versões suportadas

| Versão | Suporte de segurança |
|--------|---------------------|
| 0.10.x (atual) | ✅ Sim |
| < 0.10 | ❌ Não |

## Reportar uma vulnerabilidade

**Não abra uma issue pública** para vulnerabilidades de segurança.

Envie um e-mail para **alexandre.basto444@gmail.com** com:

- Descrição da vulnerabilidade
- Passos para reproduzir
- Impacto estimado
- Versão afetada

Respondemos em até **5 dias úteis**. Se confirmada, publicamos um patch e creditamos o descobridor (a menos que prefira anonimato).

## Postura de segurança

O LiteDock segue o modelo **Security by Design**:

- Variáveis de ambiente e credenciais de tenant cifradas em repouso (AES-256-GCM)
- Segredos (`JWT_SECRET`, `ENCRYPTION_KEY`) sem valor padrão — a API recusa
  subir se não estiverem configurados
- Sessão por JWT com expiração configurável + revogação server-side
  (`tokenVersion`) — troca de senha ou mudança de papel invalida a sessão
  antiga imediatamente, sem esperar o token expirar
- RBAC (owner/admin/member) com isolamento por tenant em todo recurso de
  projeto/serviço, e checagem de posse mesmo em ações que operam por nome de
  container Docker (sem depender só do modelo de dados)
- TOTP (2FA) disponível para todas as contas
- Docker Socket acessado via proxy restrito (Tecnativa socket-proxy) quando configurado
- Containers gerenciados isolados por label (`litedock.managed=true`) e por
  rede Docker dedicada por projeto
- Deploy worker (Python, loopback) autenticado por segredo compartilhado —
  não confia só na topologia de rede
- Rate-limit em login e validação de entrada com Zod nos endpoints
- Headers de segurança HTTP (CSP, HSTS, X-Frame-Options) via nginx

Políticas detalhadas (senha, sessão/cookies, controle de acesso, rate
limiting, gestão de segredos, logging) em [`docs/security/`](docs/security/README.md).
