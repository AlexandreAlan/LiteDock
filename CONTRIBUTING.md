# Contribuindo com o LiteDock

Obrigado pelo interesse em contribuir! Siga este guia para um processo tranquilo.

## Pré-requisitos

| Ferramenta | Versão mínima |
|------------|--------------|
| Node.js | 20+ |
| Docker | 24+ |
| pnpm / npm | qualquer |
| PostgreSQL | 15+ |
| Redis | 7+ |

## Configuração local

```bash
# 1. Clone e instale as dependências do backend
git clone https://github.com/AlexandreAlan/LiteDock.git
cd LiteDock
npm install

# 2. Instale as dependências do frontend
cd web && npm install && cd ..

# 3. Copie e edite o .env
cp .env.example .env   # ajuste DATABASE_URL, REDIS_URL, JWT_SECRET, ENCRYPTION_KEY

# 4. Suba o banco e o Redis (Docker)
docker compose -f docker-compose.dev.yml up -d

# 5. Aplique o schema no banco
npm run db:push

# 6. Inicie a API (modo watch)
npm run dev

# 7. Em outro terminal, inicie o frontend
cd web && npm run dev
```

O painel estará em **http://localhost:5173** (Vite proxy → API em :8088).

## Estrutura do projeto

```
litedock/
├── .github/
│   ├── workflows/ci.yml        # GitHub Actions: typecheck API + build frontend
│   └── ISSUE_TEMPLATE/         # Templates de bug report e feature request
├── src/                        # API (Fastify + TypeScript)
│   ├── routes/                 # Endpoints HTTP por domínio (auth, services, users…)
│   ├── services/               # Lógica de negócio (deploy, docker, metrics…)
│   ├── lib/                    # Utilitários (crypto AES-GCM, queue BullMQ, totp)
│   ├── config.ts               # Variáveis de ambiente validadas
│   ├── db.ts                   # Prisma client + bootstrap do servidor local
│   └── server.ts               # Entry-point Fastify (hooks, rotas, graceful shutdown)
├── web/src/                    # Frontend (React 18 + Vite + Tailwind + Framer Motion)
│   ├── pages/                  # Projects, Project, Service, Monitor, Domains,
│   │                           # Settings, Users, Login
│   ├── components/             # Layout, Modal, Card, MetricsBar, CommandPalette…
│   └── lib/                    # api.ts, auth.tsx, demo.ts, theme.tsx, toast.ts
├── deploy-worker/              # Worker Python (FastAPI) para builds Git + Nixpacks
├── prisma/schema.prisma        # Modelos de dados + índices PostgreSQL
├── docs/screenshots/           # Capturas de tela para o README
├── ecosystem.config.cjs        # Configuração pm2 (API + deploy-worker)
├── docker-compose.dev.yml      # PostgreSQL + Redis para desenvolvimento local
└── docker-compose.socket-proxy.yml  # Docker Socket Proxy (segurança)
```

## Fluxo de trabalho

1. **Fork** o repositório e crie uma branch: `git checkout -b feat/minha-feature`
2. **Implemente** a mudança seguindo os padrões abaixo
3. **Valide** antes do PR:
   ```bash
   # Typecheck da API
   npm run typecheck

   # Typecheck + build do frontend
   cd web && npm run typecheck && npm run build
   ```
4. **Abra um PR** preenchendo o template — o CI vai rodar automaticamente

## Padrões de código

- **TypeScript** estrito no backend e no frontend
- **Fastify** para rotas — sem `any` desnecessário, use Zod para validação de body
- **React Query** para cache de dados no frontend — sem `useEffect` para fetch
- **Tailwind** para estilos — sem CSS inline, sem `style={}`
- **Commits** em português no estilo: `feat(ui): adiciona botão de abrir serviço`
- **Segurança**: nenhum segredo no código; variáveis sensíveis sempre via `.env`

## Dúvidas?

Abra uma [issue](https://github.com/AlexandreAlan/LiteDock/issues) ou entre em contato.
