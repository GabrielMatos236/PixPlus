import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import crypto from 'node:crypto'
import { criarApp } from '../src/app.js'
import { pool } from '../src/db.js'

const app = criarApp()

describe('50 saques simultâneos de R$10 numa conta com R$100', () => {
  let contaOrigem
  let contaDestino
  const usuarioOrigem = crypto.randomUUID()
  const usuarioDestino = crypto.randomUUID()

  before(async () => {
    await pool.query('DELETE FROM lancamento')
    await pool.query('DELETE FROM conta')

    // Cria conta de origem
    const { rows: [origem] } = await pool.query(
      `INSERT INTO conta (usuario_id, chave_pix)
       VALUES ($1, $2) RETURNING id`,
      [usuarioOrigem, 'origem@teste'],
    )
    contaOrigem = origem.id

    // Cria conta de destino
    const { rows: [destino] } = await pool.query(
      `INSERT INTO conta (usuario_id, chave_pix)
       VALUES ($1, $2) RETURNING id`,
      [usuarioDestino, 'destino@teste'],
    )
    contaDestino = destino.id

    // Deposita R$ 100 (10000 centavos) na origem
    await pool.query(
      `INSERT INTO lancamento (conta_id, tipo, valor)
       VALUES ($1, 'credito', $2)`,
      [contaOrigem, 10000],
    )
  })

  after(async () => {
    await pool.query('DELETE FROM lancamento')
    await pool.query('DELETE FROM conta')
    await pool.end()
  })

  it('exatamente 10 passam e 40 recusam', async () => {
    // Dispara 50 saques de R$ 10 (1000 centavos) ao mesmo tempo
    const promessas = Array.from({ length: 50 }, (_, i) =>
      request(app)
        .post('/interno/movimentacoes')
        .send({
          transferencia_id: crypto.randomUUID(),
          conta_origem: contaOrigem,
          conta_destino: contaDestino,
          valor: 1000,
        }),
    )

    const respostas = await Promise.all(promessas)

    const sucesso = respostas.filter((r) => r.status === 201)
    const recusado = respostas.filter((r) => r.status === 422)

    assert.equal(sucesso.length, 10, `esperava 10 sucessos, veio ${sucesso.length}`)
    assert.equal(recusado.length, 40, `esperava 40 recusas, veio ${recusado.length}`)

    // Confere saldo final da origem = 0
    const { rows: [{ saldo }] } = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN tipo = 'credito' THEN valor ELSE -valor END), 0) AS saldo
       FROM lancamento WHERE conta_id = $1`,
      [contaOrigem],
    )
    assert.equal(parseInt(saldo, 10), 0, 'saldo da origem deve ser zero')
  })
})