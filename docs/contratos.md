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

Formato de erro igual ao do Auth: `{ "erro": "mensagem" }`, e erros de validação trazem `"detalhes"`.

### GET /transferencias/saude
- Autenticação: não
- Resposta 200: `{ "servico": "transferencias", "banco": true }`

`POST /transferencias` e `GET /transferencias/{id}` entram na etapa 2, junto com o contrato de `POST /interno/movimentacoes` fechado com Contas.

### Eventos (outbox)

Quando uma transferência muda para `concluida`, Transferências grava um evento na tabela `outbox` **na mesma transação** que muda o status. Ou entram os dois, ou nenhum. O worker (`transferencias/src/worker`, `npm run worker`) lê a outbox e entrega cada evento em Notificações. Assim o Pix não depende de Notificações estar no ar.

#### Evento `transferencia.concluida`
O worker manda em `POST /interno/eventos` de Notificações:

```json
{
  "id": "uuid do evento (outbox.id)",
  "tipo": "transferencia.concluida",
  "dados": {
    "transferencia_id": "uuid",
    "usuario_origem": "uuid",
    "usuario_destino": "uuid",
    "chave_destino": "string",
    "valor": 2500,
    "concluida_em": "data ISO"
  }
}
```

#### Garantias
- Entrega **pelo menos uma vez**: o mesmo evento pode chegar mais de uma vez (o worker pode entregar e cair antes de marcar como processado).
- Notificações ignora `id` repetido (coluna única) e mesmo assim **responde 2xx**. Se responder erro, o worker entende como falha e tenta de novo para sempre.
- Qualquer resposta 2xx conta como entregue. Qualquer outra coisa, ou timeout, conta como falha.
- Não há garantia de ordem entre eventos.

#### Tabela `outbox` (banco de Transferências)
| Coluna | Uso |
| --- | --- |
| `id` | UUID, é o id do evento |
| `tipo` | ex.: `transferencia.concluida` |
| `dados` | JSONB com o conteúdo do evento |
| `status` | `pendente`, `processado` ou `erro` |
| `tentativas` | quantas entregas falharam |
| `disponivel_em` | o worker só pega o evento a partir deste horário |
| `ultimo_erro` | mensagem da última falha |
| `criado_em`, `processado_em` | datas; `processado_em` só existe com status `processado` |

#### Regras do worker
1. Numa transação, pega até 50 eventos com `status = 'pendente' AND disponivel_em <= now()`, ordenados por `disponivel_em`, com `FOR UPDATE SKIP LOCKED`. Várias cópias do worker podem rodar juntas sem pegar o mesmo evento.
2. Entrega cada um em `POST /interno/eventos`.
3. Deu certo: `status = 'processado'`, `processado_em = now()`.
4. Falhou: `tentativas + 1`, `ultimo_erro`, e `disponivel_em = now() + 2^tentativas segundos` (1 s, 2 s, 4 s... cerca de 17 minutos até a 10ª). Na 10ª falha, `status = 'erro'`.
5. Sem eventos disponíveis, espera um pouco antes da próxima rodada.

Para testar o worker sem o Pix pronto, dá para inserir eventos falsos direto no banco:

```sql
INSERT INTO outbox (tipo, dados)
SELECT 'transferencia.concluida', jsonb_build_object(
  'transferencia_id', gen_random_uuid(),
  'usuario_origem', gen_random_uuid(),
  'usuario_destino', gen_random_uuid(),
  'chave_destino', 'teste@pix',
  'valor', 2500,
  'concluida_em', now())
FROM generate_series(1, 10000);
```

## Notificações

(preencher)
