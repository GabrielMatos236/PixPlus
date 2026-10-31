# Como proteger as rotas do seu serviço

Guia para Contas, Transferências e Notificações. O Auth emite o token no login; os outros serviços só **conferem** o token, sozinhos, sem chamar o Auth.

## Como funciona

1. O front faz `POST /auth/login` e recebe `{ "token": "eyJ..." }`.
2. Em toda requisição protegida, o front manda o cabeçalho `Authorization: Bearer <token>`.
3. O seu serviço confere a assinatura com o mesmo `JWT_SECRET` do Auth. Se estiver tudo certo, `req.usuarioId` passa a ter o id de quem está logado.

O token vale 1 hora e leva só o id do usuário (`sub`). Nada de CPF ou e-mail dentro dele.

## Passo a passo

### 1. Instalar a biblioteca

Na pasta do seu serviço:

```powershell
npm install jsonwebtoken
```

### 2. Copiar o middleware

Copie o arquivo `auth/src/autenticacao/validarToken.js` para `src/autenticacao/validarToken.js` do seu serviço, **sem alterar**. Ele não depende de nada do Auth.

Se encontrar um bug nele, corrija no Auth (com teste) e copie de novo para os outros serviços. Nunca deixe versões diferentes espalhadas.

### 3. Usar nas rotas

```js
import { criarValidarToken } from './autenticacao/validarToken.js'

const validarToken = criarValidarToken(process.env.JWT_SECRET)

app.get('/contas/:id', validarToken, async (req, res) => {
  // req.usuarioId = id de quem está logado (vem do token, nunca do corpo ou da URL)
})
```

O `validarToken` vai **entre** o caminho e a função da rota. Se o token faltar ou for inválido, ele responde 401 e a rota nem roda.

Para proteger todas as rotas de um grupo de uma vez:

```js
router.use(validarToken)
```

Rotas `/interno/...` (de serviço para serviço) e `/saude` **não** usam o `validarToken`.

### 4. Conferir o dono (403)

Ter um token válido não dá direito a ver tudo. Exemplo em Contas:

```js
app.get('/contas/:id', validarToken, async (req, res) => {
  const conta = await buscarConta(req.params.id)
  if (!conta) return res.status(404).json({ erro: 'conta não encontrada' })
  if (conta.usuario_id !== req.usuarioId) {
    return res.status(403).json({ erro: 'esta conta não é sua' })
  }
  res.json(conta)
})
```

- **401**: não sei quem você é (sem token, token inválido ou vencido).
- **403**: sei quem você é, mas isso não é seu.

### 5. Receber o segredo no Docker Compose

No bloco do seu serviço no `docker-compose.yml`:

```yaml
    environment:
      JWT_SECRET: ${JWT_SECRET}
```

É o mesmo valor do `.env` que o Auth usa. Se os segredos forem diferentes, todo token vira "token inválido".

## Testar com um token de verdade

Com o Auth no ar (`docker compose up -d`, porta 3001, ou `.\dev.ps1` na pasta `auth`, porta 3000):

```powershell
Set-Content cadastro.json '{"nome": "Teste", "email": "teste@teste.com", "cpf": "529.982.247-25", "senha": "senhaforte123"}'
Set-Content login.json '{"email": "teste@teste.com", "senha": "senhaforte123"}'

curl.exe -X POST http://localhost:3001/auth/cadastro -H "Content-Type: application/json" -d "@cadastro.json"
$token = (curl.exe -s -X POST http://localhost:3001/auth/login -H "Content-Type: application/json" -d "@login.json" | ConvertFrom-Json).token

curl.exe http://localhost:3001/auth/eu -H "Authorization: Bearer $token"
```

Depois use o mesmo `$token` nas rotas do seu serviço.

Nos testes automatizados, dá para gerar um token sem passar pelo Auth:

```js
import jwt from 'jsonwebtoken'
const token = jwt.sign({ sub: 'id-de-um-usuario' }, process.env.JWT_SECRET, { expiresIn: '1h' })
```

## Respostas de erro do validarToken

| Situação | Status | Corpo |
| --- | --- | --- |
| Sem cabeçalho ou sem `Bearer` | 401 | `{ "erro": "token ausente" }` |
| Assinatura errada, token adulterado, `alg: none` | 401 | `{ "erro": "token inválido" }` |
| Token vencido | 401 | `{ "erro": "token expirado" }` |

## CORS

Coloque o mesmo bloco do Auth logo depois de criar o app, **antes** das rotas:

```js
import cors from 'cors'

app.use(cors({
  origin: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((o) => o.trim()),
  optionsSuccessStatus: 200,
}))
```

(`npm install cors`, e `CORS_ORIGINS: ${CORS_ORIGINS:-http://localhost:5173}` no compose.)
