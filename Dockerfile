# dpsp-command-on-call-backend
# Build e execução do backend (API REST + WebSocket)

# ==========================================
# Stage 1: Build
# ==========================================
FROM node:20-alpine AS build
WORKDIR /app

RUN apk add --no-cache python3 make g++

# Copia dependências e instala
COPY package.json package-lock.json ./
RUN npm ci

# Copia o código-fonte e configurações
COPY src ./src
COPY tsconfig.json ./

# Compila o TypeScript
RUN npx tsc -p tsconfig.json

# ==========================================
# Stage 2: Production
# ==========================================
FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache python3 make g++

# Copia dependências e instala apenas as de produção
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copia o código compilado do Stage 1
COPY --from=build /app/dist ./dist

# Cria diretório de dados para o SQLite
RUN mkdir -p /app/data

# Define variáveis de ambiente
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Configura o Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/status || exit 1

# Inicia a aplicação
CMD ["node", "dist/backend/index.js"]