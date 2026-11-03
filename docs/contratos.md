# Contratos das rotas

Cada serviço documenta aqui as próprias rotas. Mudou a rota, muda este arquivo no mesmo PR.

Regras: dinheiro em centavos (inteiro), rotas em minúsculas, rotas `/interno/...` só entre serviços (o nginx não expõe).

Modelo para cada rota:

```
### POST /auth/login
- Autenticação: não
- Corpo: `{ "email": "string", "senha": "string" }`
- Resposta 200: `{ "token": "string" }`
  - JWT HS256 com validade de 1 hora; o conteúdo leva só `sub` (id do usuário), `iat` e `exp`
  - Os outros serviços conferem o token localmente com o mesmo `JWT_SECRET`, mandado no cabeçalho `Authorization: Bearer <token>`
- Erros: 400 (dados inválidos), 401 (e-mail ou senha incorretos; mesma resposta para e-mail inexistente e senha errada)
```

## Auth

Formato de erro de todos os endpoints: `{ "erro": "mensagem" }`. Erros de validação trazem também `"detalhes": [{ "campo": "...", "mensagem": "..." }]`.

### GET /auth/saude
- Autenticação: não
- Resposta 200: `{ "servico": "auth", "banco": true }`

### POST /auth/cadastro
- Autenticação: não
- Corpo: `{ "nome": "string", "email": "string", "cpf": "string", "senha": "string" }`
  - `nome`: 2 a 100 caracteres
  - `email`: e-mail válido; é guardado em minúsculas
  - `cpf`: com ou sem pontuação; dígitos verificadores conferidos
  - `senha`: 8 a 128 caracteres; guardada só como hash argon2id
- Resposta 201: `{ "id": "uuid", "nome": "string", "email": "string", "criado_em": "data ISO" }`
- Erros: 400 (dados inválidos ou JSON malformado), 409 (e-mail ou cpf já cadastrado)

### POST /auth/login
- Autenticação: não
- Corpo: `{ "email": "string", "senha": "string" }`
- Resposta 200: `{ "token": "string" }`
  - JWT HS256 com validade de 1 hora; o conteúdo leva só `sub` (id do usuário), `iat` e `exp`
  - Os outros serviços conferem o token localmente com o mesmo `JWT_SECRET`, mandado no cabeçalho `Authorization: Bearer <token>`
- Erros: 400 (dados inválidos), 401 (e-mail ou senha incorretos; mesma resposta para e-mail inexistente e senha errada)

### GET /auth/eu
- Autenticação: sim, `Authorization: Bearer <token>`
- Resposta 200: `{ "id": "uuid", "nome": "string", "email": "string", "criado_em": "data ISO" }`
- Erros: 401 (`token ausente`, `token inválido` ou `token expirado`), 404 (usuário do token não existe mais)

## Contas

## Contas

Formato de erro igual ao do Auth: `{ "erro": "mensagem" }`, e erros de validação trazem `"detalhes"`.
Rotas com autenticação usam `Authorization: Bearer <token>` e respondem 401 (`token ausente`, `token inválido` ou `token expirado`).
Valores sempre em centavos (inteiro).

### GET /contas/saude
- Autenticação: não
- Resposta 200: `{ "servico": "contas", "banco": true }`

### POST /contas
- Autenticação: sim
- Corpo: `{ "chave_pix": "string" }` (1 a 140 caracteres)
- Resposta 201: `{ "id": "uuid", "usuario_id": "uuid", "chave_pix": "string", "criada_em": "data ISO" }`
- Erros: 400 (dados inválidos), 401, 409 (chave pix já cadastrada)

### GET /contas/{id}
- Autenticação: sim
- Resposta 200: `{ "id": "uuid", "usuario_id": "uuid", "chave_pix": "string", "criada_em": "data ISO" }`
- Erros: 401, 403 (conta de outro usuário), 404 (conta não encontrada)

### POST /contas/{id}/depositos
- Autenticação: sim
- Corpo: `{ "valor": 1000 }` (inteiro maior que zero)
- Resposta 201: `{ "id": "uuid", "conta_id": "uuid", "tipo": "credito", "valor": 1000, "transferencia_id": null, "criado_em": "data ISO" }`
- Erros: 400, 401, 403, 404

### GET /contas/{id}/saldo
- Autenticação: sim
- Resposta 200: `{ "conta_id": "uuid", "saldo": 1000 }` (soma dos créditos menos soma dos débitos)
- Erros: 401, 403, 404

### GET /contas/{id}/extrato?pagina=1&limite=20
- Autenticação: sim
- `pagina` a partir de 1 (padrão 1); `limite` de 1 a 100 (padrão 20)
- Resposta 200: `{ "lancamentos": [{ "id", "tipo", "valor", "transferencia_id", "criado_em" }], "total": 0, "pagina": 1, "limite": 20, "paginas": 0 }`, do mais novo para o mais antigo
- Erros: 400, 401, 403, 404

### GET /interno/contas?chave=...
- Só entre serviços (usada por Transferências)
- Resposta 200: `{ "id": "uuid", "usuario_id": "uuid" }`
- Erros: 400 (chave ausente), 404 (chave pix não encontrada)

### GET /interno/verificacao
- Só entre serviços (usada pelos testes de carga)
- Resposta 200: `{ "soma_total": 0, "contas_negativas": [{ "id": "uuid", "chave_pix": "string", "saldo": -500 }] }`

## Transferências

(preencher)

## Notificações

(preencher)
