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
├── src/                    # API (Fastify + TypeScript)
│   ├── routes/             # Endpoints HTTP organizados por domínio
│   ├── services/           # Lógica de negócio (deploy, monitor, Docker…)
│   └── lib/                # Utilitários (crypto, queue…)
├── web/src/                # Frontend (React + Vite + Tailwind)
│   ├── pages/              # Páginas (Projects, Service, Monitor, Settings…)
│   ├── components/         # Componentes reutilizáveis
│   └── lib/                # API client, autenticação, demo mode
├── deploy-worker/          # Worker Python (FastAPI) para builds Git/Nixpacks
├── prisma/                 # Schema do banco (PostgreSQL)
└── docs/screenshots/       # Capturas de tela para o README
```

## Fluxo de trabalho

1. **Fork** o repositório e crie uma branch: `git checkout -b feat/minha-feature`
2. **Implemente** a mudança seguindo os padrões abaixo
3. **Teste** localmente (frontend e backend)
4. **Abra um PR** preenchendo o template

## Padrões de código

- **TypeScript** estrito no backend e no frontend
- **Fastify** para rotas — sem `any` desnecessário, use Zod para validação de body
- **React Query** para cache de dados no frontend — sem `useEffect` para fetch
- **Tailwind** para estilos — sem CSS inline, sem `style={}`
- **Commits** em português no estilo: `feat(ui): adiciona botão de abrir serviço`
- **Segurança**: nenhum segredo no código; variáveis sensíveis sempre via `.env`

## Dúvidas?

Abra uma [issue](https://github.com/AlexandreAlan/LiteDock/issues) ou entre em contato.
