FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN NODE_ENV=development npm ci

# Dependências primeiro: se só o código mudar, o Docker reaproveita esta camada.
COPY package.json package-lock.json ./
RUN npm ci

COPY migrations ./migrations
COPY src ./src
COPY test ./test

# Não roda como root dentro do container.
USER node
EXPOSE 3000

# Aplica as migrations pendentes e sobe o serviço.
# O "exec" faz o Node receber o sinal de parada do Docker direto (desligamento educado).
CMD ["sh", "-c", "npx node-pg-migrate up --no-verbose && exec node src/server.js"]
