import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'

const nomeBanco = new URL(process.env.DATABASE_URL ?? 'postgres://x/sem-banco').pathname.slice(1)
if (!nomeBanco.endsWith('_test')) {
  console.error(`[testes] recusei rodar no banco "${nomeBanco}". Use um banco terminado em _test.`)
  process.exit(1)
}

const { criarApp } = await import('../src/app.js')
const { pool } = await import('../src/db.js')

const app = criarApp()

after(async () => {
  await pool.end()
})

test('GET /transferencias/saude responde com o banco ligado', async () => {
  const resposta = await request(app).get('/transferencias/saude')

  assert.equal(resposta.status, 200)
  assert.deepEqual(resposta.body, { servico: 'transferencias', banco: true })
})

test('rota que não existe devolve 404 em JSON', async () => {
  const resposta = await request(app).get('/transferencias/nao-existe')

  assert.equal(resposta.status, 404)
  assert.deepEqual(resposta.body, { erro: 'rota não encontrada' })
})

test('rotas /interno de outros serviços não existem aqui', async () => {
  const resposta = await request(app).post('/interno/eventos').send({})

  assert.equal(resposta.status, 404)
})
