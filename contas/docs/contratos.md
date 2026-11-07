# Contratos do Serviço Contas

## POST /interno/movimentacoes

Rota interna (sem JWT). Chamada pelo serviço de Transferências para executar um Pix.

### Request

```json
{
  "transferencia_id": "uuid",
  "conta_origem": "uuid",
  "conta_destino": "uuid",
  "valor": 3000
}
```

| Campo             | Tipo   | Obrigatório | Descrição                          |
|-------------------|--------|-------------|------------------------------------|
| transferencia_id  | string | sim         | UUID gerado pelo serviço de Transferências |
| conta_origem      | string | sim         | UUID da conta que será debitada    |
| conta_destino     | string | sim         | UUID da conta que será creditada   |
| valor             | number | sim         | Valor em centavos (inteiro positivo) |

### Respostas

**201 Created**
```json
{
  "transferencia_id": "uuid",
  "saldo_origem": 7000
}
```

**400 Bad Request** — corpo inválido (campo faltando ou tipo errado)
```json
{
  "erro": "dados inválidos",
  "detalhes": [
    { "campo": "valor", "mensagem": "valor é obrigatório e deve ser número" }
  ]
}
```

**404 Not Found** — conta de origem ou destino inexistente
```json
{
  "erro": "conta de origem não encontrada"
}
```

**422 Unprocessable Entity** — saldo insuficiente
```json
{
  "erro": "saldo insuficiente"
}
```

### Observações

- Débito e crédito são criados na mesma transação (BEGIN/COMMIT/ROLLBACK)
- Versão ingênua: sem SELECT ... FOR UPDATE (lock será adicionado na Etapa 3)
- Valores sempre em centavos (R$ 30,00 = 3000)


## PATCH /contas/{id}

Rota protegida (JWT). Troca a chave Pix da conta.

### Request

Header: `Authorization: Bearer <token>`

```json
{
  "chave_pix": "nova-chave@email.com"
}
```

### Respostas

**200 OK**
```json
{
  "id": "uuid",
  "usuario_id": "uuid",
  "chave_pix": "nova-chave@email.com",
  "criada_em": "2026-11-07T..."
}
```

**400** — corpo inválido
**401** — token ausente ou inválido
**403** — conta não pertence ao usuário
**409** — chave pix já cadastrada em outra conta

---

## DELETE /contas/{id}

Rota protegida (JWT). Encerra a conta (soft delete — marca `encerrada_em`).

### Request

Header: `Authorization: Bearer <token>`

Sem body.

### Respostas

**200 OK**
```json
{
  "id": "uuid",
  "usuario_id": "uuid",
  "chave_pix": "chave@email.com",
  "criada_em": "2026-11-07T...",
  "encerrada_em": "2026-11-07T..."
}
```

**401** — token ausente ou inválido
**403** — conta não pertence ao usuário
**422** — saldo diferente de zero

### Observações

- Encerrar não apaga do banco: marca `encerrada_em` com a data atual
- Conta encerrada não aparece em `/contas/minha` nem em `/interno/contas`
- Conta encerrada não recebe Pix
- O extrato continua acessível por `/contas/{id}/extrato`