import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { criarContasFalso } from './contasFalso.js'

const nomeBanco = new URL(process.env.DATABASE_URL ?? 'postgres://x/sem-banco').pathname.slice(1)
if (!nomeBanco.endsWith('_test')) {
  console.error(`[testes] recusei rodar no banco "${nomeBanco}". Use um banco terminado em _test.`)
  process.exit(1)
}

// O Contas falso sobe primeiro: o config.js lê CONTAS_URL na hora do import.
const contas = await criarContasFalso()
process.env.CONTAS_URL = contas.url

const { criarApp } = await import('../src/app.js')
const { pool } = await import('../src/db.js')
const { config } = await import('../src/config.js')

const app = criarApp()
const token = jwt.sign({ sub: randomUUID() }, config.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' })
const autorizacao = `Bearer ${token}`

before(async () => {
  await pool.query('SELECT 1')
})

after(async () => {
  await pool.end()
  await contas.fechar()
})

test('Pix com caractere nulo na chave devolve 400, não 503', async () => {
  const resposta = await request(app)
    .post('/transferencias')
    .set('Authorization', autorizacao)
    .send({ chave_destino: 'x\u0000y', valor: 100 })
  assert.equal(resposta.status, 400)
  assert.match(resposta.body.erro, /caractere nulo/)
})

test('caminho com % inválido devolve 400, não 500', async () => {
  const resposta = await request(app)
    .get('/transferencias/%ZZ')
    .set('Authorization', autorizacao)
  assert.equal(resposta.status, 400)
  assert.equal(resposta.body.erro, 'caminho inválido')
})
