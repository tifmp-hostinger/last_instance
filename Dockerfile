# ============================================================
# Última Instância — backend Node (Express) + jogo estático
# Serve o jogo e a API na porta 3000. Autenticação e placar em
# Postgres self-hosted, configurados por variáveis de ambiente
# (ver .env.example). Sem banco, sobe em modo mock.
# ============================================================
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# dependências primeiro (camada cacheável)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# código
COPY server ./server
COPY public ./public
COPY db ./db

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=6s \
  CMD wget -qO- http://127.0.0.1:3000/api/saude >/dev/null 2>&1 || exit 1

CMD ["node", "server/index.js"]
