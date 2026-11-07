import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, pool, novoUsuario, limparBanco } from './apoio.js'

let maria
let conta

beforeEach(async () => {
  await limparBanco()
  maria = novoUsuario()
  const resposta = await request(app)
    .post('/contas')
    .set('Authorization', maria.autorizacao)
    .send({ chave_pix: 'maria@pix' })
  conta = resposta.body
})

after(async () => {
  await pool.end()
})

// ─── GET /interno/contas ─────────────────────────────────────

test('?chave= acha a conta de destino, sem token', async () => {
  const resposta = await request(app).get('/interno/contas?chave=maria@pix')

  assert.equal(resposta.status, 200)
  assert.deepEqual(resposta.body, { id: conta.id, usuario_id: maria.id })
})

test('?chave= ignora maiúsculas e espaços, como o cadastro', async () => {
  const resposta = await request(app).get('/interno/contas').query({ chave: ' Maria@PIX ' })

  assert.equal(resposta.status, 200)
  assert.equal(resposta.body.id, conta.id)
})

test('?usuario_id= acha a conta de origem', async () => {
  const resposta = await request(app).get(`/interno/contas?usuario_id=${maria.id}`)

  assert.equal(resposta.status, 200)
  assert.deepEqual(resposta.body, { id: conta.id, usuario_id: maria.id })
})

test('chave inexistente devolve 404', async () => {
  const resposta = await request(app).get('/interno/contas?chave=ninguem@pix')

  assert.equal(resposta.status, 404)
  assert.equal(resposta.body.erro, 'chave pix não encontrada')
})

test('usuário sem conta devolve 404', async () => {
  const resposta = await request(app).get(`/interno/contas?usuario_id=${novoUsuario().id}`)

  assert.equal(resposta.status, 404)
  assert.equal(resposta.body.erro, 'usuário sem conta')
})

test('sem parâmetro, ou com os dois, devolve 400', async () => {
  for (const consulta of ['', `?chave=maria@pix&usuario_id=${maria.id}`]) {
    const resposta = await request(app).get(`/interno/contas${consulta}`)

    assert.equal(resposta.status, 400, consulta)
    assert.equal(resposta.body.detalhes[0].mensagem, 'informe chave ou usuario_id (só um dos dois)')
  }
})

test('usuario_id que não é UUID devolve 400', async () => {
  const resposta = await request(app).get('/interno/contas?usuario_id=abc')

  assert.equal(resposta.status, 400)
  assert.deepEqual(resposta.body.detalhes, [{ campo: 'usuario_id', mensagem: 'usuario_id deve ser um UUID' }])
})

// ─── GET /interno/verificacao ────────────────────────────────

test('verificação soma os saldos e lista as contas negativas', async () => {
  const joao = novoUsuario()
  const contaJoao = (await request(app)
    .post('/contas')
    .set('Authorization', joao.autorizacao)
    .send({ chave_pix: 'joao@pix' })).body

  await pool.query(
    `INSERT INTO lancamento (conta_id, tipo, valor) VALUES
       ($1, 'credito', 10000),
       ($2, 'debito', 500)`,
    [conta.id, contaJoao.id],
  )

  const resposta = await request(app).get('/interno/verificacao')

  assert.equal(resposta.status, 200)
  assert.equal(resposta.body.soma_total, 9500)
  assert.deepEqual(resposta.body.contas_negativas, [{ id: contaJoao.id, chave_pix: 'joao@pix', saldo: -500 }])
})
