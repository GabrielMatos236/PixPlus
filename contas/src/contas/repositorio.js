import { pool } from '../db.js'
import { ErroHttp } from '../erros.js'

// O Postgres recusa (com erro, que virava 500) um id que não tem formato de UUID.
// Conferir antes deixa "GET /contas/abc" responder 404, como qualquer conta inexistente.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── Conta ───────────────────────────────────────────────────

export async function criarConta(usuarioId, chavePix) {
  const { rows } = await pool.query(
    `INSERT INTO conta (usuario_id, chave_pix)
     VALUES ($1, $2)
     RETURNING id, usuario_id, chave_pix, criada_em`,
    [usuarioId, chavePix],
  )
  return rows[0]
}

export async function buscarContaPorId(id) {
  if (!UUID.test(id)) return null
  const { rows } = await pool.query(
    `SELECT id, usuario_id, chave_pix, criada_em, encerrada_em FROM conta WHERE id = $1`,
    [id],
  )
  return rows[0] ?? null
}

// Cada usuário tem no máximo uma conta (UNIQUE no banco).
export async function buscarContaPorUsuario(usuarioId) {
  const { rows } = await pool.query(
    `SELECT id, usuario_id, chave_pix, criada_em FROM conta
     WHERE usuario_id = $1 AND encerrada_em IS NULL`,
    [usuarioId],
  )
  return rows[0] ?? null
}

// Usada pelas rotas internas: devolve só o que outro serviço precisa.
export async function buscarContaInterna({ chave, usuarioId }) {
  const { rows } = chave !== undefined
    ? await pool.query(`SELECT id, usuario_id FROM conta WHERE chave_pix = $1 AND encerrada_em IS NULL`, [chave])
    : await pool.query(`SELECT id, usuario_id FROM conta WHERE usuario_id = $1 AND encerrada_em IS NULL`, [usuarioId])
  return rows[0] ?? null
}

// ─── Lançamentos ─────────────────────────────────────────────

export async function criarLancamento(contaId, tipo, valor, transferenciaId = null) {
  const { rows } = await pool.query(
    `INSERT INTO lancamento (conta_id, tipo, valor, transferencia_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, conta_id, tipo, valor, transferencia_id, criado_em`,
    [contaId, tipo, valor, transferenciaId],
  )
  return rows[0]
}

// ─── Saldo ───────────────────────────────────────────────────

export async function calcularSaldo(contaId) {
  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN tipo = 'credito' THEN valor ELSE 0 END), 0)
       -
       COALESCE(SUM(CASE WHEN tipo = 'debito' THEN valor ELSE 0 END), 0)
       AS saldo
     FROM lancamento
     WHERE conta_id = $1`,
    [contaId],
  )
  return parseInt(rows[0].saldo, 10)
}

// ─── Extrato ─────────────────────────────────────────────────

export async function listarExtrato(contaId, pagina, limite) {
  const offset = (pagina - 1) * limite

  const [{ rows: lancamentos }, { rows: totais }] = await Promise.all([
    pool.query(
      `SELECT id, tipo, valor, transferencia_id, criado_em
       FROM lancamento
       WHERE conta_id = $1
       ORDER BY criado_em DESC, id DESC -- id desempata lançamentos do mesmo instante
       LIMIT $2 OFFSET $3`,
      [contaId, limite, offset],
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total FROM lancamento WHERE conta_id = $1`,
      [contaId],
    ),
  ])

  return {
    lancamentos,
    total: totais[0].total,
    pagina,
    limite,
    paginas: Math.ceil(totais[0].total / limite),
  }
}

// ─── Verificação (rota interna, testes de carga) ─────────────

export async function verificacao() {
  const { rows } = await pool.query(`
    SELECT
      c.id,
      c.chave_pix,
      COALESCE(SUM(CASE WHEN l.tipo = 'credito' THEN l.valor ELSE 0 END), 0)
      -
      COALESCE(SUM(CASE WHEN l.tipo = 'debito' THEN l.valor ELSE 0 END), 0)
      AS saldo
    FROM conta c
    LEFT JOIN lancamento l ON l.conta_id = c.id
    GROUP BY c.id
  `)

  const somaTotal = rows.reduce((acc, r) => acc + parseInt(r.saldo, 10), 0)
  const contasNegativas = rows
    .filter((r) => parseInt(r.saldo, 10) < 0)
    .map((r) => ({ id: r.id, chave_pix: r.chave_pix, saldo: parseInt(r.saldo, 10) }))

  return { soma_total: somaTotal, contas_negativas: contasNegativas }
}

// ─── Movimentação (débito + crédito atômicos) ───────────────
//
// Etapa 3: a conta de ORIGEM fica travada (FOR NO KEY UPDATE) do momento em que
// as contas são conferidas até o COMMIT. Dois Pix saindo da mesma conta não leem
// mais o mesmo saldo: o segundo espera o primeiro terminar e só então soma os
// lançamentos, já vendo o débito que acabou de entrar. A versão sem lock, que
// deixava a conta negativa, está guardada na tag v0-ingenua.
//
// Idempotência: se o transferencia_id já aparece na tabela lancamento, o Pix já
// foi processado. Devolve o saldo atual da origem sem inserir de novo.
// A UNIQUE (transferencia_id, tipo) garante no banco que duplicatas são impossíveis.
//
// Débito e crédito usam o MESMO cliente do pool (pool.connect). Com pool.query,
// cada comando pode cair numa conexão diferente e o BEGIN/COMMIT não vale.
export async function executarMovimentacao(transferenciaId, contaOrigem, contaDestino, valor) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // ── Idempotência: se já processou essa transferência, devolve o resultado ──
    const { rows: jaExiste } = await client.query(
      `SELECT 1 FROM lancamento WHERE transferencia_id = $1 LIMIT 1`,
      [transferenciaId],
    )

    if (jaExiste.length > 0) {
      const { rows: [{ saldo }] } = await client.query(
        `SELECT COALESCE(SUM(CASE WHEN tipo = 'credito' THEN valor ELSE -valor END), 0) AS saldo
         FROM lancamento WHERE conta_id = $1`,
        [contaOrigem],
      )
      await client.query('COMMIT')
      return { transferencia_id: transferenciaId, saldo_origem: parseInt(saldo, 10) }
    }

    const { rows: contas } = await client.query(
      'SELECT id FROM conta WHERE id = ANY($1::uuid[])',
      [[contaOrigem, contaDestino]],
    )
    const existe = (id) => contas.some((conta) => conta.id === id)
    if (!existe(contaOrigem)) throw new ErroHttp(404, 'conta de origem não encontrada')
    if (!existe(contaDestino)) throw new ErroHttp(404, 'conta de destino não encontrada')

    // Trava a linha da conta de ORIGEM até o COMMIT. Outro Pix saindo da
    // mesma conta espera aqui e só lê o saldo depois que este débito entrou.
    // FOR NO KEY UPDATE, e não FOR UPDATE: o INSERT em lancamento confere a FK
    // conta_id com um FOR KEY SHARE na conta de destino. FOR UPDATE conflita com
    // esse lock e o Pix cruzado (A→B e B→A ao mesmo tempo) dá deadlock;
    // FOR NO KEY UPDATE não conflita, mas continua barrando outro débito da mesma conta.
    // Funciona no READ COMMITTED padrão: o SUM abaixo é outro comando, então
    // ele já enxerga o que foi commitado enquanto este Pix esperava o lock.
    await client.query('SELECT id FROM conta WHERE id = $1 FOR NO KEY UPDATE', [contaOrigem])

    const { rows: [{ saldo }] } = await client.query(
      `SELECT COALESCE(SUM(CASE WHEN tipo = 'credito' THEN valor ELSE -valor END), 0) AS saldo
       FROM lancamento
       WHERE conta_id = $1`,
      [contaOrigem],
    )
    const saldoAtual = parseInt(saldo, 10)

    if (saldoAtual < valor) throw new ErroHttp(422, 'saldo insuficiente')

    await client.query(
      `INSERT INTO lancamento (conta_id, tipo, valor, transferencia_id)
       VALUES ($1, 'debito', $3, $4), ($2, 'credito', $3, $4)`,
      [contaOrigem, contaDestino, valor, transferenciaId],
    )

    await client.query('COMMIT')
    return { transferencia_id: transferenciaId, saldo_origem: saldoAtual - valor }
  } catch (erro) {
    await client.query('ROLLBACK')
    throw erro
  } finally {
    client.release()
  }
}

export async function atualizarChavePix(contaId, novaChave) {
  const { rows } = await pool.query(
    `UPDATE conta SET chave_pix = $1 WHERE id = $2
     RETURNING id, usuario_id, chave_pix, criada_em`,
    [novaChave, contaId],
  )
  return rows[0]
}

export async function encerrarConta(contaId) {
  const { rows } = await pool.query(
    `UPDATE conta SET encerrada_em = NOW() WHERE id = $1
     RETURNING id, usuario_id, chave_pix, criada_em, encerrada_em`,
    [contaId],
  )
  return rows[0]
}