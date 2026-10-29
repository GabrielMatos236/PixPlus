# Contratos das rotas

Cada serviço documenta aqui as próprias rotas. Mudou a rota, muda este arquivo no mesmo PR.

Regras: dinheiro em centavos (inteiro), rotas em minúsculas, rotas `/interno/...` só entre serviços (o nginx não expõe).

Modelo para cada rota:

```
### POST /auth/login
- Autenticação: não
- Corpo: { "email": "string", "senha": "string" }
- Resposta 200: { "token": "string" }
- Erros: 401 (e-mail ou senha incorretos)
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
(em construção)

### GET /auth/eu
(em construção)

## Contas

(preencher)

## Transferências

(preencher)

## Notificações

(preencher)
