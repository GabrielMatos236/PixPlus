import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { criarApp } from '../src/app.js'
import { pool } from '../src/db.js'
import { config } from '../src/config.js'

const app = criarApp()

// Gera um token JWT válido pro usuário de teste
function gerarToken(usuarioId) {
  return jwt.sign({ sub: usuarioId }, config.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
  })
}

describe('PATCH /contas/:id', () => {
  let contaId
  let token
  const usuarioId = crypto.randomUUID()

  before(async () => {
    await pool.query('DELETE FROM lancamento')
    await pool.query('DELETE FROM conta')

    const { rows: [conta] } = await pool.query(
      `INSERT INTO conta (usuario_id, chave_pix)
       VALUES ($1, $2) RETURNING id`,
      [usuarioId, 'chave-original@teste'],
    )
    contaId = conta.id
    token = gerarToken(usuarioId)
  })

  after(async () => {
    await pool.query('DELETE FROM lancamento')
    await pool.query('DELETE FROM conta')
  })

  it('200 — troca a chave pix com sucesso', async () => {
    const res = await request(app)
      .patch(`/contas/${contaId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ chave_pix: 'chave-nova@teste' })

    assert.equal(res.status, 200)
    assert.equal(res.body.chave_pix, 'chave-nova@teste')
    assert.equal(res.body.id, contaId)
  })

  it('409 — chave pix já usada por outra conta', async () => {
    // Cria outra conta com uma chave específica
    await pool.query(
      `INSERT INTO conta (usuario_id, chave_pix)
       VALUES ($1, $2)`,
      [crypto.randomUUID(), 'chave-ocupada@teste'],
    )

    const res = await request(app)
      .patch(`/contas/${contaId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ chave_pix: 'chave-ocupada@teste' })

    assert.equal(res.status, 409)
  })

  it('401 — sem token', async () => {
    const res = await request(app)
      .patch(`/contas/${contaId}`)
      .send({ chave_pix: 'qualquer@teste' })

    assert.equal(res.status, 401)
  })

  it('403 — conta de outro usuário', async () => {
    const outroToken = gerarToken(crypto.randomUUID())

    const res = await request(app)
      .patch(`/contas/${contaId}`)
      .set('Authorization', `Bearer ${outroToken}`)
      .send({ chave_pix: 'invasor@teste' })

    assert.equal(res.status, 403)
  })

  it('400 — corpo inválido', async () => {
    const res = await request(app)
      .patch(`/contas/${contaId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({})

    assert.equal(res.status, 400)
  })
})

describe('DELETE /contas/:id', () => {
  let contaId
  let token
  const usuarioId = crypto.randomUUID()

  beforeEach(async () => {
    await pool.query('DELETE FROM lancamento')
    await pool.query('DELETE FROM conta')

    const { rows: [conta] } = await pool.query(
      `INSERT INTO conta (usuario_id, chave_pix)
       VALUES ($1, $2) RETURNING id`,
      [usuarioId, 'encerrar@teste'],
    )
    contaId = conta.id
    token = gerarToken(usuarioId)
  })

  after(async () => {
    await pool.query('DELETE FROM lancamento')
    await pool.query('DELETE FROM conta')
    await pool.end()
  })

  it('200 — encerra conta com saldo zero', async () => {
    const res = await request(app)
      .delete(`/contas/${contaId}`)
      .set('Authorization', `Bearer ${token}`)

    assert.equal(res.status, 200)
    assert.ok(res.body.encerrada_em, 'deve ter encerrada_em preenchido')
  })

  it('422 — recusa encerrar com saldo diferente de zero', async () => {
    // Deposita R$ 50 pra ter saldo
    await pool.query(
      `INSERT INTO lancamento (conta_id, tipo, valor)
       VALUES ($1, 'credito', $2)`,
      [contaId, 5000],
    )

    const res = await request(app)
      .delete(`/contas/${contaId}`)
      .set('Authorization', `Bearer ${token}`)

    assert.equal(res.status, 422)
  })

  it('401 — sem token', async () => {
    const res = await request(app)
      .delete(`/contas/${contaId}`)

    assert.equal(res.status, 401)
  })

  it('403 — conta de outro usuário', async () => {
    const outroToken = gerarToken(crypto.randomUUID())

    const res = await request(app)
      .delete(`/contas/${contaId}`)
      .set('Authorization', `Bearer ${outroToken}`)

    assert.equal(res.status, 403)
  })
})