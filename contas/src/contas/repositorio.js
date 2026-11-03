import { pool } from '../db.js'

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
  const { rows } = await pool.query(
    `SELECT id, usuario_id, chave_pix, criada_em FROM conta WHERE id = $1`,
    [id],
  )
  return rows[0] ?? null
}

export async function buscarContaPorChave(chavePix) {
  const { rows } = await pool.query(
    `SELECT id, usuario_id FROM conta WHERE chave_pix = $1`,
    [chavePix],
  )
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
       ORDER BY criado_em DESC
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