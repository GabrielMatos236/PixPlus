import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { app, pool, limparBanco } from './apoio.js'

let origem
let destino
let servidor
let url

// Um servidor só, ouvindo de verdade: com ele as chamadas simultâneas chegam
// juntas no banco (o supertest abre um servidor por requisição e espaça tudo).
before(async () => {
  servidor = app.listen(0)
  await new Promise((resolve) => servidor.once('listening', resolve))
  url = `http://127.0.0.1:${servidor.address().port}`
})

async function novaConta(saldo) {
  const { rows: [conta] } = await pool.query(
    'INSERT INTO conta (usuario_id, chave_pix) VALUES ($1, $2) RETURNING id',
    [randomUUID(), randomUUID()],
  )
  if (saldo) {
    await pool.query("INSERT INTO lancamento (conta_id, tipo, valor) VALUES ($1, 'credito', $2)", [conta.id, saldo])
  }
  return conta.id
}

async function saldo(contaId) {
  const { rows: [{ s }] } = await pool.query(
    "SELECT COALESCE(SUM(CASE WHEN tipo = 'credito' THEN valor ELSE -valor END), 0)::int AS s FROM lancamento WHERE conta_id = $1",
    [contaId],
  )
  return s
}

function mover(transferenciaId, valor = 1000) {
  return request(app).post('/interno/movimentacoes').send({
    transferencia_id: transferenciaId,
    conta_origem: origem,
    conta_destino: destino,
    valor,
  })
}

beforeEach(async () => {
  await limparBanco()
  origem = await novaConta(10000) // R$ 100,00
  destino = await novaConta(0)
})

after(async () => {
  await new Promise((resolve) => servidor.close(resolve))
  await pool.end()
})

test('o UNIQUE (transferencia_id, tipo) existe de verdade no banco', async () => {
  const { rows } = await pool.query(
    "SELECT 1 FROM pg_constraint WHERE conname = 'lancamento_transferencia_tipo_unico'",
  )
  assert.equal(rows.length, 1)
})

test('repetir a chamada com o mesmo transferencia_id não lança de novo', async () => {
  const id = randomUUID()

  const primeira = await mover(id)
  const repeticao = await mover(id)

  assert.equal(primeira.status, 201)
  assert.equal(repeticao.status, 201)
  assert.equal(repeticao.body.saldo_origem, 9000)
  assert.equal(await saldo(origem), 9000)
  assert.equal(await saldo(destino), 1000)
})

test('chamadas SIMULTÂNEAS com o mesmo transferencia_id: um débito só', async () => {
  // É o caso do Transferências tentando de novo depois de um timeout enquanto a
  // primeira chamada ainda esperava o lock da conta de origem.
  // 20 rodadas de 5 chamadas ao mesmo tempo, cada rodada com um id novo.
  for (let rodada = 1; rodada <= 20; rodada++) {
    const id = randomUUID()
    const corpo = JSON.stringify({ transferencia_id: id, conta_origem: origem, conta_destino: destino, valor: 100 })
    const status = await Promise.all(Array.from({ length: 5 }, () =>
      fetch(`${url}/interno/movimentacoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: corpo,
      }).then((r) => r.status),
    ))

    assert.deepEqual(status, [201, 201, 201, 201, 201], `rodada ${rodada}`)
    assert.equal(await saldo(origem), 10000 - 100 * rodada, `rodada ${rodada}: débito repetido`)
  }
  assert.equal(await saldo(destino), 2000)
})
