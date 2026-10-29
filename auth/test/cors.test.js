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
const ORIGEM_PERMITIDA = 'http://localhost:5173'

after(async () => {
  await pool.end()
})

test('origem da lista recebe a autorização do CORS', async () => {
  const resposta = await request(app).get('/auth/saude').set('Origin', ORIGEM_PERMITIDA)

  assert.equal(resposta.headers['access-control-allow-origin'], ORIGEM_PERMITIDA)
})

test('origem fora da lista não recebe autorização', async () => {
  const resposta = await request(app).get('/auth/saude').set('Origin', 'https://site-malicioso.com')

  assert.equal(resposta.headers['access-control-allow-origin'], undefined)
})

test('pergunta prévia do navegador (preflight) é respondida com 200', async () => {
  const resposta = await request(app)
    .options('/auth/login')
    .set('Origin', ORIGEM_PERMITIDA)
    .set('Access-Control-Request-Method', 'POST')
    .set('Access-Control-Request-Headers', 'Content-Type')

  assert.equal(resposta.status, 200)
  assert.equal(resposta.headers['access-control-allow-origin'], ORIGEM_PERMITIDA)
  assert.match(resposta.headers['access-control-allow-methods'], /POST/)
})

test('respostas de erro também levam o cabeçalho, para o front ler a mensagem', async () => {
  const resposta = await request(app)
    .post('/auth/login')
    .set('Origin', ORIGEM_PERMITIDA)
    .send({})

  assert.equal(resposta.status, 400)
  assert.equal(resposta.headers['access-control-allow-origin'], ORIGEM_PERMITIDA)
})

test('sem cabeçalho Origin (curl, outro serviço) a requisição funciona normalmente', async () => {
  const resposta = await request(app).get('/auth/saude')

  assert.equal(resposta.status, 200)
})