# Ferramentas e bibliotecas

Tudo o que o PixPlus usa, pra que serve e onde aparece no repositório. Conferido na `main` em 16/11/2026 (até o PR #37).

No lugar do Prisma, a gente usa o **`pg`**, com SQL escrito à mão.

Quem adicionar ou trocar uma biblioteca atualiza este arquivo no mesmo PR, como no `docs/contratos.md`.

## Ferramentas

| Ferramenta | Pra que a gente usa | Onde aparece |
| --- | --- | --- |
| Node 22 | Roda os quatro serviços e o worker da outbox. É a ferramenta principal do projeto | Imagem `node:22-alpine` em `infra/Dockerfile.padrao` |
| Docker e Docker Compose | Um container por serviço e um por banco. `docker compose up` sobe tudo com um comando, e `--scale` cria réplicas | `docker-compose.yml`, `infra/Dockerfile.padrao` |
| PostgreSQL 16 | Quatro bancos separados, um por serviço. Também faz o papel da fila de mensagens, pela tabela `outbox` | Imagem `postgres:16` no compose. O `pg_isready` do healthcheck segura cada serviço até o banco dele estar pronto |
| nginx 1.27 | Porta de entrada única (porta 80). Manda `/auth`, `/contas`, `/transferencias` e `/notificacoes` pro serviço certo, bloqueia `/interno` e distribui as requisições entre réplicas | `infra/nginx.conf` |
| Firebase Authentication | Autenticação externa pedida pelo professor: login com Google e com e-mail e senha | SDK `firebase` no front e `firebase-admin` no Auth |
| k6 | Testes de carga: simula centenas de usuários ao mesmo tempo e mede requisições por segundo e p95 | `carga/*.js` e os resultados em `carga/resultados-*.md` |
| Test runner do Node (`node --test`) | Roda os testes automatizados de cada serviço. Vem embutido no Node, então não tem Jest | `npm test` em cada serviço, arquivos em `test/` |
| Vite | Servidor de desenvolvimento e build do front React. O front roda fora do compose, com `npm run dev` | `front/` |
| Git e GitHub | Código, branches e PRs. Todo PR tem revisão de outra pessoa | `GabrielMatos236/PixPlus` |
| PowerShell | Script auxiliar pra coletar os saldos no Windows | `carga/coletar-saldos.ps1` |

A Vercel entra só no fim, pra publicar o front, se o resto estiver pronto.

## Bibliotecas

Os quatro serviços de back-end usam quase as mesmas bibliotecas. Só o Auth tem duas a mais: `argon2` e `firebase-admin`.

### Back-end

| Biblioteca | Pra que a gente usa | Serviços |
| --- | --- | --- |
| `express` 5 | Framework HTTP: define as rotas (`app.get`, `app.post`) e os middlewares, como o que confere o token antes da rota | Os quatro |
| `pg` (node-postgres) | Driver que conversa com o Postgres. A gente escreve o SQL à mão, e ele cuida do pool de conexões. Pra transação, `pool.connect()` pega uma conexão só, que vai do `BEGIN` ao `COMMIT` | Os quatro |
| `node-pg-migrate` | Migrations: as tabelas são criadas e alteradas por arquivos `.sql` numerados em `migrations/`, aplicados sozinhos quando o container sobe | Os quatro |
| `zod` | Valida o corpo da requisição (campo obrigatório, tipo, formato). Se não passar, a rota devolve 400 antes de tocar no banco | Os quatro |
| `jsonwebtoken` | O Auth assina o JWT (HS256, vale 1 hora). Os outros serviços conferem o token sozinhos, com o mesmo `JWT_SECRET`, sem chamar o Auth | Os quatro |
| `cors` | Deixa o front, que roda em outro endereço, chamar a API pelo navegador | Os quatro |
| `argon2` | Transforma a senha num hash antes de gravar. O banco nunca guarda a senha | Auth |
| `firebase-admin` | Confere o token que o Firebase entrega ao front (`verifyIdToken`) e troca pelo nosso JWT em `POST /auth/firebase` | Auth |
| `supertest` (só nos testes) | Chama as rotas nos testes sem precisar subir o servidor | Os quatro |

Do próprio Node, sem instalar nada, saem o `node:test` (testes), o `node:crypto` (UUID) e o `fetch`, que é como um serviço chama o outro (Transferências chamando Contas, o worker chamando Notificações).

### Front

| Biblioteca | Pra que a gente usa |
| --- | --- |
| `react` 19 e `react-dom` | As telas: login, completar cadastro, início e enviar Pix |
| `react-router-dom` 7 | Navegação entre as telas, sem recarregar a página |
| `firebase` | SDK web do Firebase: login com Google e com e-mail e senha, e o `getIdToken()` que vai pro Auth |
| `vite` e `@vitejs/plugin-react` (só desenvolvimento) | Sobem o front com recarga automática e geram o build final |
| `eslint` e plugins (só desenvolvimento) | Apontam erros comuns no código React, como hook usado no lugar errado |
| `@types/react` (só desenvolvimento) | Autocompletar no editor. Não vai pro build |

O front chama a API com o `fetch` do navegador, sem `axios`.

## Perguntas que o professor pode fazer

Cada resposta cabe em duas frases. Vale todo mundo ler, não só quem é dono do serviço.

| Pergunta | Resposta curta |
| --- | --- |
| Por que `pg` e não Prisma? | Prisma é um ORM: ele escreve o SQL por você. O centro do projeto é a concorrência, com `SELECT ... FOR UPDATE` e `FOR UPDATE SKIP LOCKED`, que o Prisma não tem na API normal: ia ter que cair em SQL cru (`$queryRaw`) justo nas partes importantes. Com o `pg`, o SQL que roda é exatamente o que está no código |
| E por que não Knex? | O Knex monta SQL por funções, mas não ajuda muito nas consultas com lock. Escrever o SQL direto deixou mais fácil de ler e de explicar |
| Por que Postgres? | Transações confiáveis e o `SKIP LOCKED`, que deixa dois workers lerem a mesma fila sem pegar o mesmo evento |
| Por que não RabbitMQ ou Kafka? | O requisito era mensageria via banco. A tabela `outbox` grava o evento na mesma transação que conclui o Pix: ou os dois ficam salvos, ou nenhum. Com uma fila separada, o Pix podia concluir e o evento se perder |
| Pra que Firebase e JWT ao mesmo tempo? | O Firebase prova quem a pessoa é (Google ou e-mail e senha). Depois o Auth entrega o nosso JWT, que os quatro serviços conferem sozinhos, sem chamar o Google nem o Auth a cada requisição |
| Por que argon2 e não bcrypt? | O argon2 é o recomendado hoje pra senha e gasta memória de propósito, o que atrapalha quem tenta adivinhar senhas com placa de vídeo. No começo ele deixava o login lento sob carga (p95 de 6,38 s), e a gente ajustou os parâmetros no PR #23 |
| Por que Express? | Está nos requisitos oficiais. E é o framework Node mais conhecido, com muito material |
| Pra que o zod? | Pra rejeitar dado errado na porta, com 400, antes de chegar no banco. A regra fica escrita num lugar só |
| Pra que o nginx? | O front fala com um endereço só. O nginx esconde as rotas `/interno` e distribui a carga quando tem várias réplicas do mesmo serviço |
| Pra que o k6? | Pra provar com número: centenas de usuários ao mesmo tempo, quantas contas ficaram negativas, requisições por segundo e p95. Os scripts são em JavaScript, a mesma linguagem do resto |
| Por que dinheiro em centavos? | `0.1 + 0.2` dá `0.30000000000000004` em ponto flutuante. Com centavos inteiros, R$ 10,50 é `1050` e a conta sempre fecha |
| Por que um banco por serviço? | Cada serviço é dono dos próprios dados e só fala com o outro pela API. Assim dá pra mudar ou escalar um sem quebrar os outros |
