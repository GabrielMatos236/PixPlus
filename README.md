# Banco Pix

Sistema bancário com microserviços (Node.js + Postgres + Docker). Cada serviço tem o próprio banco e o próprio container.

Este README é o passo a passo para rodar o projeto do zero. Cada pessoa do grupo roda **a própria cópia** no próprio PC. Ninguém se conecta ao banco de outra pessoa: o que o grupo compartilha é o código, pelo Git.

## Estrutura do repositório

```
banco-pix/
├── auth/            # cadastro, login, JWT
├── contas/          # contas, lançamentos, saldo, extrato
├── transferencias/  # Pix, idempotência, outbox + worker
├── notificacoes/    # avisos, recebe eventos do worker
├── front/           # telas
├── infra/           # nginx, Dockerfile padrão
├── carga/           # scripts k6, seed, resultados
├── docs/
│   └── contratos.md # rotas de cada serviço
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

## Parte 1: instalar as ferramentas (cada pessoa, uma vez)

Abra o **PowerShell** e rode:

```powershell
winget install Docker.DockerDesktop
winget install OpenJS.NodeJS.LTS
winget install Git.Git
winget install k6
```

Se o `winget` disser "Nenhum pacote encontrou os critérios", o ID está diferente. Descubra o certo com `winget search nome` (por exemplo, `winget search k6`) e instale com o valor da coluna **ID**.

Para ver as tabelas dos bancos, instale também um cliente visual (opcional):

```powershell
winget search dbeaver
```

Instale com o ID que aparecer (costuma ser `DBeaver.DBeaver.Community`). O pgAdmin também serve.

Depois de instalar tudo, **feche e abra o PowerShell de novo**, senão ele não enxerga os comandos novos.

### 1.1 Liberar scripts no PowerShell (erro do `npm`)

Se o `npm --version` reclamar que "a execução de scripts foi desabilitada", rode uma vez:

```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Responda `S` quando ele perguntar. Isso vale só para o seu usuário e não precisa de administrador.

### 1.2 Instalar o WSL2 (necessário para o Docker no Windows)

Se o Docker Desktop mostrar "WSL not installed":

1. Abra o PowerShell **como administrador** (botão direito, "Executar como administrador").
2. Rode:

```powershell
wsl --install
```

3. **Reinicie o PC.** Se o Ubuntu abrir pedindo usuário e senha, crie qualquer um e feche a janela.

Se der erro de **virtualização**, ela está desligada na BIOS: reinicie, entre na BIOS e ative *Intel VT-x* ou *AMD SVM* (o nome muda conforme a placa-mãe).

### 1.3 Ligar o Docker

1. Abra o **Docker Desktop** pelo menu Iniciar. Se pedir login, use "Continue without signing in".
2. Espere o canto inferior esquerdo ficar **verde** com "Engine running" (pode levar 1 a 2 minutos).

Digitar `docker` no terminal não liga o motor. Se aparecer `failed to connect to the docker API ... npipe`, o Docker Desktop está fechado.

## Parte 2: conferir o ambiente

```powershell
docker --version
docker compose version
node --version
npm --version
git --version
k6 version
```

Os seis precisam responder com uma versão. Depois:

```powershell
docker run hello-world
```

Tem que aparecer "Hello from Docker!".

Teste do Postgres:

```powershell
docker run --name teste-pg -e POSTGRES_PASSWORD=teste -p 5439:5432 -d postgres:16
docker exec -it teste-pg psql -U postgres
```

Se abrir o prompt `postgres=#`, digite `SELECT 1;` e depois `\q` para sair. Limpe o teste:

```powershell
docker rm -f teste-pg
```

## Parte 3: criar o repositório (uma pessoa só, a que cuida da infra)

As demais pessoas pulam para a Parte 4.

```powershell
mkdir banco-pix
cd banco-pix
git init
foreach ($pasta in "auth","contas","transferencias","notificacoes","front","infra","carga","docs") {
  mkdir $pasta
  New-Item "$pasta/.gitkeep" -ItemType File
}
```

O Git não guarda pasta vazia, por isso cada pasta ganha um arquivo `.gitkeep` (vazio). Ele pode ser apagado depois que a pasta tiver conteúdo de verdade.

Crie na raiz estes três arquivos, crie o `docs/contratos.md` e faça o commit:

- `docker-compose.yml`: um Postgres por serviço (`auth-db`, `contas-db`, `transferencias-db`, `notificacoes-db`), com `healthcheck` usando `pg_isready` e um volume para cada banco. Os serviços e o nginx entram nele nas próximas etapas.
- `.env.example`: lista todas as variáveis, sem segredos reais.
- `.gitignore`: precisa conter `.env` e `node_modules/`.

Conteúdo do `.env.example`:

```
AUTH_DB_PASSWORD=troque-isso
CONTAS_DB_PASSWORD=troque-isso
TRANSFERENCIAS_DB_PASSWORD=troque-isso
NOTIFICACOES_DB_PASSWORD=troque-isso
JWT_SECRET=troque-por-uma-frase-longa-e-aleatoria
```

Depois, suba para o GitHub e proteja a `main` (só entra código por PR):

```powershell
git add .
git commit -m "estrutura inicial do projeto"
git branch -M main
git remote add origin URL_DO_REPOSITORIO
git push -u origin main
```

## Parte 4: rodar o projeto (cada pessoa)

```powershell
git clone URL_DO_REPOSITORIO
cd banco-pix
Copy-Item .env.example .env
```

O `.env` é o arquivo com as senhas de verdade da **sua** máquina e nunca vai para o Git. Pode deixar os valores de exemplo, ou trocar por outros.

Suba tudo:

```powershell
docker compose up -d
docker compose ps
```

Na coluna de status, todos os bancos têm que ficar `healthy` (leva alguns segundos). O `-d` deixa rodando em segundo plano.

## Parte 5: ver os bancos

### Pelo terminal

```powershell
docker compose exec contas-db psql -U contas -d contas
```

Dentro do `psql`:

- `\dt` lista as tabelas
- `SELECT * FROM lancamento;` mostra os lançamentos
- `\q` sai

As tabelas só aparecem depois que o serviço roda as migrations. No começo o banco está vazio.

### Pelo DBeaver ou pgAdmin

Crie uma conexão PostgreSQL por banco:

| Banco | Host | Porta | Database | Usuário | Senha |
| --- | --- | --- | --- | --- | --- |
| Auth | localhost | 5433 | auth | auth | `AUTH_DB_PASSWORD` do `.env` |
| Contas | localhost | 5434 | contas | contas | `CONTAS_DB_PASSWORD` do `.env` |
| Transferências | localhost | 5435 | transferencias | transferencias | `TRANSFERENCIAS_DB_PASSWORD` do `.env` |
| Notificações | localhost | 5436 | notificacoes | notificacoes | `NOTIFICACOES_DB_PASSWORD` do `.env` |

Dentro do container o Postgres sempre usa a porta 5432. O que muda é a porta de fora, para os quatro não baterem entre si.

### Consulta útil: saldo de cada conta

```sql
SELECT conta_id,
       SUM(CASE WHEN tipo = 'credito' THEN valor ELSE -valor END) AS saldo
FROM lancamento
GROUP BY conta_id
ORDER BY saldo;
```

Conta com saldo abaixo de zero é o furo da versão ingênua.

## Comandos do dia a dia

| Comando | O que faz |
| --- | --- |
| `docker compose up -d` | sobe tudo em segundo plano |
| `docker compose ps` | mostra o que está rodando e o estado de saúde |
| `docker compose logs -f contas` | acompanha o log de um serviço |
| `docker compose down` | desliga tudo, **mantendo** os dados |
| `docker compose down -v` | desliga e **apaga** os dados (volumes) |
| `docker compose up -d --build` | sobe de novo reconstruindo as imagens |

## Problemas comuns

| Sintoma | Causa e solução |
| --- | --- |
| `npm ... execução de scripts foi desabilitada` | Rode o `Set-ExecutionPolicy` da seção 1.1 |
| `Docker Desktop - WSL not installed` | Siga a seção 1.2 e reinicie o PC |
| `failed to connect to the docker API` | O Docker Desktop está fechado ou ainda abrindo. Espere o "Engine running" |
| `k6` ou outro comando "não é reconhecido" | Feche e abra o PowerShell. Se continuar, instale de novo com o ID certo do `winget search` |
| `port is already allocated` | Outra coisa usa a porta (ex.: um Postgres instalado no PC). Mude a porta da esquerda no `docker-compose.yml` |
| Serviço não conecta no banco | Confira o `.env` e se o banco está `healthy` no `docker compose ps` |

## Regras do grupo

- Contrato antes de código: as rotas ficam em `docs/contratos.md`. Mudou a rota, muda o arquivo no mesmo PR.
- Dinheiro em centavos, sempre inteiro. Nunca float.
- Rotas `/interno/...` são só de serviço para serviço. O nginx não expõe nenhuma.
- Nenhum serviço acessa o banco de outro.
- Todo PR tem revisão de uma pessoa, e a `main` sempre sobe com um comando.
- Commits em português, rotas em minúsculas.
