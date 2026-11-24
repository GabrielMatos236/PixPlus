import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, pool, novoUsuario, limparBanco } from './apoio.js'

beforeEach(async () => {
  await limparBanco()
})

after(async () => {
  await pool.end()
})

// O Postgres recusa \u0000 em TEXT. Antes da trava, isso estourava no INSERT/SELECT e virava 500.
test('chave Pix com caractere nulo devolve 400, não 500', async () => {
  const maria = novoUsuario()
  const resposta = await request(app)
    .post('/contas')
    .set('Authorization', maria.autorizacao)
    .send({ chave_pix: 'maria\u0000@pix' })
  assert.equal(resposta.status, 400)
  assert.match(resposta.body.erro, /caractere nulo/)
})

test('busca interna com caractere nulo na query devolve 400, não 500', async () => {
  // Transferências entendia o 500 daqui como "Contas fora do ar" e devolvia 503.
  const resposta = await request(app).get('/interno/contas?chave=x%00y')
  assert.equal(resposta.status, 400)
})

test('caminho com % inválido devolve 400, não 500', async () => {
  const maria = novoUsuario()
  const resposta = await request(app)
    .get('/contas/%E0%A4%A/saldo')
    .set('Authorization', maria.autorizacao)
  assert.equal(resposta.status, 400)
  assert.equal(resposta.body.erro, 'caminho inválido')
})
