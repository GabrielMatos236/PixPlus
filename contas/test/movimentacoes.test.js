import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import crypto from 'node:crypto'
import { criarApp } from '../src/app.js'
import { pool } from '../src/db.js'

const app = criarApp()

describe('POST /interno/movimentacoes', () => {
  // IDs das contas de teste — serão preenchidos no before
  let contaOrigemId
  let contaDestinoId

  // Cria duas contas no banco antes de todos os testes
  before(async () => {
    // Limpa dados antigos de testes anteriores
    await pool.query('DELETE FROM lancamento')
    await pool.query('DELETE FROM conta')

    // Cria conta de origem
    const { rows: [origem] } = await pool.query(
      `INSERT INTO conta (usuario_id, chave_pix)
       VALUES ($1, $2)
       RETURNING id`,
      [crypto.randomUUID(), 'origem@teste'],
    )
    contaOrigemId = origem.id

    // Cria conta de destino
    const { rows: [destino] } = await pool.query(
      `INSERT INTO conta (usuario_id, chave_pix)
       VALUES ($1, $2)
       RETURNING id`,
      [crypto.randomUUID(), 'destino@teste'],
    )
    contaDestinoId = destino.id
  })

  // Antes de cada teste: limpa lançamentos e deposita R$ 100 na origem
  beforeEach(async () => {
    await pool.query('DELETE FROM lancamento')

    await pool.query(
      `INSERT INTO lancamento (conta_id, tipo, valor)
       VALUES ($1, 'credito', $2)`,
      [contaOrigemId, 10000],  // R$ 100,00 em centavos
    )
  })

  // Fecha a conexão com o banco depois de todos os testes
  after(async () => {
    await pool.query('DELETE FROM lancamento')
    await pool.query('DELETE FROM conta')
    await pool.end()
  })

  // ─── 201: movimentação com sucesso ─────────────────────
  it('201 — debita origem, credita destino e retorna saldo', async () => {
    const res = await request(app)
      .post('/interno/movimentacoes')
      .send({
        transferencia_id: crypto.randomUUID(),
        conta_origem: contaOrigemId,
        conta_destino: contaDestinoId,
        valor: 3000,  // R$ 30,00
      })

    assert.equal(res.status, 201)
    assert.equal(res.body.saldo_origem, 7000)  // 10000 - 3000
    assert.ok(res.body.transferencia_id)
  })

  // ─── 400: corpo inválido ───────────────────────────────
  it('400 — corpo sem campos obrigatórios', async () => {
    const res = await request(app)
      .post('/interno/movimentacoes')
      .send({})  // vazio

    assert.equal(res.status, 400)
  })

    // ─── 404: conta inexistente ────────────────────────────
  it('404 — conta de origem inexistente', async () => {
    const res = await request(app)
      .post('/interno/movimentacoes')
      .send({
        transferencia_id: crypto.randomUUID(),
        conta_origem: '00000000-0000-0000-0000-000000000000',
        conta_destino: contaDestinoId,
        valor: 1000,
      })

    assert.equal(res.status, 404)
  })
  
  // ─── 422: saldo insuficiente ───────────────────────────
  it('422 — valor maior que o saldo', async () => {
    const res = await request(app)
      .post('/interno/movimentacoes')
      .send({
        transferencia_id: crypto.randomUUID(),
        conta_origem: contaOrigemId,
        conta_destino: contaDestinoId,
        valor: 50000,  // R$ 500, mas só tem R$ 100
      })

    assert.equal(res.status, 422)
  })

  // ─── Débito + crédito com mesmo transferencia_id ───────
  it('débito e crédito registrados com o mesmo transferencia_id', async () => {
    const transferenciaId = crypto.randomUUID()

    await request(app)
      .post('/interno/movimentacoes')
      .send({
        transferencia_id: transferenciaId,
        conta_origem: contaOrigemId,
        conta_destino: contaDestinoId,
        valor: 2000,  // R$ 20,00
      })

    // Busca os lançamentos dessa transferência
    const { rows } = await pool.query(
      'SELECT conta_id, tipo, valor FROM lancamento WHERE transferencia_id = $1',
      [transferenciaId],
    )

    // Deve ter exatamente 2 lançamentos: um débito e um crédito
    assert.equal(rows.length, 2)

    const debito = rows.find((r) => r.tipo === 'debito')
    const credito = rows.find((r) => r.tipo === 'credito')

    assert.ok(debito, 'deve ter um lançamento de débito')
    assert.ok(credito, 'deve ter um lançamento de crédito')
    assert.equal(debito.conta_id, contaOrigemId)
    assert.equal(credito.conta_id, contaDestinoId)
    assert.equal(parseInt(debito.valor, 10), 2000)
    assert.equal(parseInt(credito.valor, 10), 2000)
  })
})