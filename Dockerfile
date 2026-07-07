# ── Stage 1: instala dependências e gera o Prisma client ─────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# node-pty é addon nativo (node-gyp) — precisa de toolchain de build.
# Fica só neste estágio; a imagem final (stage 2) não carrega isso.
RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY prisma ./prisma

# Instala tudo (incluindo devDeps: tsx, prisma CLI) e gera o client
RUN npm ci && npx prisma generate

# ── Stage 2: imagem de runtime ────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Usuário sem privilégios — nunca rodar como root em produção
RUN addgroup -S litedock && adduser -S litedock -G litedock

# Copia node_modules (com tsx e @prisma/client) e schema do prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma      ./prisma

# Código-fonte e configs
COPY package.json tsconfig.json ./
COPY src ./src

USER litedock

EXPOSE 8088

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8088/health || exit 1

# Mesmo comando do ecosystem.config.cjs — sinal chega direto no processo Node
CMD ["node", "--import", "tsx", "src/server.ts"]
