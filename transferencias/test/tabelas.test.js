import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const nomeBanco = new URL(process.env.DATABASE_URL ?? 'postgres://x/sem-banco').pathname.slice(1)
if (!nomeBanco.endsWith('_test')) {
  console.error(`[testes] recusei rodar no banco "${nomeBanco}". Use um banco terminado em _test.`)
  process.exit(1)
}

const { pool } = await import('../src/db.js')

const VIOLOU_UNICA = '23505'
const VIOLOU_CHECK = '23514'

function novaTransferencia(campos = {}) {
  return {
    chave_idempotencia: randomUUID(),
    usuario_origem: randomUUID(),
    conta_origem: randomUUID(),
    usuario_destino: randomUUID(),
    conta_destino: randomUUID(),
    chave_destino: 'maria@pix',
    valor: 2500,
    ...campos,
  }
}

async function inserirTransferencia(t) {
  const { rows } = await pool.query(
    `INSERT INTO transferencia
       (chave_idempotencia, usuario_origem, conta_origem, usuario_destino, conta_destino, chave_destino, valor)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [t.chave_idempotencia, t.usuario_origem, t.conta_origem, t.usuario_destino, t.conta_destino, t.chave_destino, t.valor],
  )
  return rows[0]
}

async function inserirEventos(quantidade) {
  await pool.query(
    `INSERT INTO outbox (tipo, dados)
     SELECT 'transferencia.concluida', jsonb_build_object('n', n)
     FROM generate_series(1, $1) AS n`,
    [quantidade],
  )
}

before(async () => {
  await pool.query('SELECT 1')
})

beforeEach(async () => {
  await pool.query('TRUNCATE transferencia, outbox')
})

after(async () => {
  await pool.end()
})

// ─── transferencia ───────────────────────────────────────────

test('transferência nasce pendente, sem motivo de falha', async () => {
  const t = await inserirTransferencia(novaTransferencia())

  assert.equal(t.status, 'pendente')
  assert.equal(t.motivo_falha, null)
})

test('mesma chave de idempotência do mesmo usuário é recusada', async () => {
  const primeira = await inserirTransferencia(novaTransferencia())

  await assert.rejects(
    inserirTransferencia(novaTransferencia({
      usuario_origem: primeira.usuario_origem,
      chave_idempotencia: primeira.chave_idempotencia,
    })),
    { code: VIOLOU_UNICA },
  )
})

test('mesma chave de idempotência de usuários diferentes é aceita', async () => {
  const chave = randomUUID()

  await inserirTransferencia(novaTransferencia({ chave_idempotencia: chave }))
  await inserirTransferencia(novaTransferencia({ chave_idempotencia: chave }))
})

test('valor zero ou negativo é recusado', async () => {
  await assert.rejects(inserirTransferencia(novaTransferencia({ valor: 0 })), { code: VIOLOU_CHECK })
  await assert.rejects(inserirTransferencia(novaTransferencia({ valor: -100 })), { code: VIOLOU_CHECK })
})

test('conta de origem igual à de destino é recusada', async () => {
  const conta = randomUUID()

  await assert.rejects(
    inserirTransferencia(novaTransferencia({ conta_origem: conta, conta_destino: conta })),
    { code: VIOLOU_CHECK },
  )
})

test('status falhou exige motivo, e só ele pode ter motivo', async () => {
  const t = await inserirTransferencia(novaTransferencia())

  await assert.rejects(
    pool.query(`UPDATE transferencia SET status = 'falhou' WHERE id = $1`, [t.id]),
    { code: VIOLOU_CHECK },
  )
  await assert.rejects(
    pool.query(`UPDATE transferencia SET motivo_falha = 'x' WHERE id = $1`, [t.id]),
    { code: VIOLOU_CHECK },
  )
  await pool.query(
    `UPDATE transferencia SET status = 'falhou', motivo_falha = 'saldo insuficiente' WHERE id = $1`,
    [t.id],
  )
})

// ─── outbox ──────────────────────────────────────────────────

test('evento nasce pendente, disponível agora e sem tentativas', async () => {
  const { rows } = await pool.query(
    `INSERT INTO outbox (tipo, dados) VALUES ('transferencia.concluida', '{"valor": 2500}')
     RETURNING *, disponivel_em <= now() AS disponivel`,
  )
  const evento = rows[0]

  assert.equal(evento.status, 'pendente')
  assert.equal(evento.tentativas, 0)
  assert.equal(evento.disponivel, true)
  assert.equal(evento.processado_em, null)
  assert.deepEqual(evento.dados, { valor: 2500 })
})

test('processado exige processado_em, e pendente não pode ter', async () => {
  const { rows } = await pool.query(
    `INSERT INTO outbox (tipo, dados) VALUES ('transferencia.concluida', '{}') RETURNING id`,
  )
  const id = rows[0].id

  await assert.rejects(
    pool.query(`UPDATE outbox SET status = 'processado' WHERE id = $1`, [id]),
    { code: VIOLOU_CHECK },
  )
  await assert.rejects(
    pool.query(`UPDATE outbox SET processado_em = now() WHERE id = $1`, [id]),
    { code: VIOLOU_CHECK },
  )
  await pool.query(`UPDATE outbox SET status = 'processado', processado_em = now() WHERE id = $1`, [id])
})

test('evento com disponivel_em no futuro não é pego pelo worker', async () => {
  await inserirEventos(3)
  await pool.query(`UPDATE outbox SET disponivel_em = now() + interval '1 minute'
                    WHERE id = (SELECT id FROM outbox LIMIT 1)`)

  const { rows } = await pool.query(
    `SELECT id FROM outbox WHERE status = 'pendente' AND disponivel_em <= now()`,
  )
  assert.equal(rows.length, 2)
})

test('dois workers ao mesmo tempo não pegam o mesmo evento (SKIP LOCKED)', async () => {
  await inserirEventos(80)

  const consulta = `
    SELECT id FROM outbox
    WHERE status = 'pendente' AND disponivel_em <= now()
    ORDER BY disponivel_em
    LIMIT 50
    FOR UPDATE SKIP LOCKED`

  const worker1 = await pool.connect()
  const worker2 = await pool.connect()
  try {
    await worker1.query('BEGIN')
    await worker2.query('BEGIN')

    const lote1 = (await worker1.query(consulta)).rows.map((r) => r.id)
    const lote2 = (await worker2.query(consulta)).rows.map((r) => r.id)

    assert.equal(lote1.length, 50)
    assert.equal(lote2.length, 30) // só sobraram os não travados
    const repetidos = lote1.filter((id) => lote2.includes(id))
    assert.deepEqual(repetidos, [])

    await worker1.query('COMMIT')
    await worker2.query('COMMIT')
  } finally {
    worker1.release()
    worker2.release()
  }
})
