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