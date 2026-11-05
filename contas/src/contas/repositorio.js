import { pool } from '../db.js'

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
    `SELECT id, usuario_id, chave_pix, criada_em FROM conta WHERE id = $1`,
    [id],
  )
  return rows[0] ?? null
}

// Cada usuário tem no máximo uma conta (UNIQUE no banco).
export async function buscarContaPorUsuario(usuarioId) {
  const { rows } = await pool.query(
    `SELECT id, usuario_id, chave_pix, criada_em FROM conta WHERE usuario_id = $1`,
    [usuarioId],
  )
  return rows[0] ?? null
}

// Usada pelas rotas internas: devolve só o que outro serviço precisa.
export async function buscarContaInterna({ chave, usuarioId }) {
  const { rows } = chave !== undefined
    ? await pool.query(`SELECT id, usuario_id FROM conta WHERE chave_pix = $1`, [chave])
    : await pool.query(`SELECT id, usuario_id FROM conta WHERE usuario_id = $1`, [usuarioId])
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