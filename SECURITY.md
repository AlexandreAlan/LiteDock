# Política de Segurança

## Versões suportadas

| Versão | Suporte de segurança |
|--------|---------------------|
| 0.6.x (atual) | ✅ Sim |
| < 0.6 | ❌ Não |

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

- Variáveis de ambiente cifradas em repouso (AES-256-GCM)
- JWT com rotação de segredo configurável
- TOTP (2FA) disponível para todas as contas
- Docker Socket acessado via proxy restrito (Tecnativa socket-proxy)
- Containers gerenciados isolados por label (`litedock.managed=true`)
- Rate-limit e validação de entrada com Zod em todos os endpoints
- Headers de segurança HTTP (CSP, HSTS, X-Frame-Options) via nginx
