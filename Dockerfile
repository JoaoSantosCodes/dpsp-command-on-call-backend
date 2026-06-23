# dpsp-command-on-call-backend
# Build e execução do backend (API REST + WebSocket)

# ==========================================
# Stage 1: Build
# ==========================================
FROM node:20-alpine AS build
WORKDIR /app

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

# Copia dependências e instala apenas as de produção
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copia o código compilado do Stage 1
COPY --from=build /app/dist ./dist

# ==========================================
# CÓPIA DOS TEMPLATES (AJUSTE SE NECESSÁRIO)
# ==========================================
# Opção 1 (Padrão): A pasta está na raiz do projeto e o app lê da raiz
COPY templates ./templates

# Opção 2: Se a pasta "templates" estiver na raiz, mas o app compilado 
# espera encontrá-la dentro da pasta "dist", use a linha abaixo em vez da de cima:
# COPY templates ./dist/templates

# Opção 3: Se a pasta "templates" estiver dentro de "src" (src/templates):
# COPY src/templates ./templates
# ==========================================

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