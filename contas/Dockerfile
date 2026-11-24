FROM node:22-alpine

WORKDIR /app

# Dependências primeiro: se só o código mudar, o Docker reaproveita esta camada.
COPY package.json package-lock.json ./
ARG NODE_ENV=production
RUN if [ "$NODE_ENV" = "development" ]; then npm ci; else npm ci --omit=dev; fi

COPY migrations ./migrations
COPY src ./src

# Não roda como root dentro do container.
USER node
EXPOSE 3000

# Aplica as migrations pendentes e sobe o serviço.
# O "exec" faz o Node receber o sinal de parada do Docker direto (desligamento educado).
CMD ["sh", "-c", "npx node-pg-migrate up --no-verbose && exec node src/server.js"]