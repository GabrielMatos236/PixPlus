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

(preencher)

## Contas

(preencher)

## Transferências

(preencher)

## Notificações

(preencher)
