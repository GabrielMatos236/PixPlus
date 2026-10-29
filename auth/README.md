# Serviço Auth

Cadastro, login e emissão de JWT. Dono: pessoa C.

## Estrutura

```
auth/
├── migrations/          # mudanças no banco, versionadas e em ordem
├── src/
│   ├── config.js        # lê e confere as variáveis de ambiente (falha na subida se faltar algo)
│   ├── db.js            # pool de conexões com o Postgres
│   ├── erros.js         # ErroHttp + middleware que transforma erros em respostas
│   ├── app.js           # monta o Express (rotas, JSON, 404, erros), sem abrir porta
│   ├── server.js        # abre a porta e desliga educadamente ao receber SIGTERM
│   └── usuarios/
│       ├── validacao.js # regras dos dados de entrada (zod) e dígitos do CPF
│       ├── repositorio.js # todo o SQL da tabela usuario
│       └── rotas.js     # HTTP: recebe, valida, chama o repositório, responde
├── test/                # testes automatizados contra um Postgres real
├── Dockerfile
├── dev.ps1              # roda no seu PC ligado ao banco do Docker
└── test.ps1             # roda os testes no banco auth_test
```

Cada camada tem um trabalho só: a rota não escreve SQL, o repositório não sabe o que é HTTP, e a validação não sabe que existe banco.

## Rodar no seu PC

Com os bancos de pé (`docker compose up -d` na raiz):

```powershell
cd auth
npm install
.\dev.ps1
```

O script lê a senha do `.env` da raiz, aplica as migrations pendentes e sobe o serviço na porta 3000. Ele reinicia sozinho quando você salva um arquivo.

## Testes

```powershell
.\test.ps1
```

Os testes rodam no banco `auth_test` (criado na primeira vez, dentro do container `auth-db`) e apagam os dados dele a cada teste. Eles se recusam a rodar num banco cujo nome não termine em `_test`, pra nunca apagar o banco de desenvolvimento.

## Migrations

Toda mudança no banco é um arquivo novo em `migrations/`. Nunca edite uma migration que já foi pro Git: crie outra.

```powershell
npx node-pg-migrate create nome-da-mudanca -j sql
```

Cada arquivo tem uma parte `-- Up Migration` (aplica) e `-- Down Migration` (desfaz). A tabela `pgmigrations` guarda quais já rodaram, então rodar de novo não repete nada.

## No Docker Compose

Bloco para o `docker-compose.yml` da raiz:

```yaml
  auth:
    build: ./auth
    environment:
      DATABASE_URL: postgres://auth:${AUTH_DB_PASSWORD}@auth-db:5432/auth
    depends_on:
      auth-db:
        condition: service_healthy
    ports:
      - "127.0.0.1:3001:3000" # provisório, até o nginx existir
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/auth/saude || exit 1"]
      interval: 5s
      timeout: 3s
      retries: 10
```

O container aplica as migrations sozinho ao subir. A porta 3001 evita conflito com o `.\dev.ps1`, que usa a 3000.
