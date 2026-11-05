import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, pool, novoUsuario, limparBanco } from './apoio.js'

let maria

async function criarConta(usuario, chave_pix) {
  return request(app).post('/contas').set('Authorization', usuario.autorizacao).send({ chave_pix })
}

beforeEach(async () => {
  await limparBanco()
  maria = novoUsuario()
})

after(async () => {
  await pool.end()
})

// ─── POST /contas ────────────────────────────────────────────

test('cria a conta do usuário logado', async () => {
  const resposta = await criarConta(maria, 'maria@pix')

  assert.equal(resposta.status, 201)
  assert.equal(resposta.body.usuario_id, maria.id)
  assert.equal(resposta.body.chave_pix, 'maria@pix')
  assert.ok(resposta.body.id)
})

test('chave é salva sem espaços nas pontas e em minúsculas', async () => {
  const resposta = await criarConta(maria, '  Maria@PIX  ')

  assert.equal(resposta.status, 201)
  assert.equal(resposta.body.chave_pix, 'maria@pix')
})

test('chave só com espaços é recusada (antes virava chave vazia)', async () => {
  const resposta = await criarConta(maria, '   ')

  assert.equal(resposta.status, 400)
  assert.deepEqual(resposta.body.detalhes, [{ campo: 'chave_pix', mensagem: 'chave_pix não pode ser vazia' }])
})

test('chave que só difere em maiúsculas conta como repetida: 409', async () => {
  await criarConta(maria, 'maria@pix')
  const resposta = await criarConta(novoUsuario(), 'MARIA@pix')

  assert.equal(resposta.status, 409)
  assert.equal(resposta.body.erro, 'chave pix já cadastrada')
})

test('segunda conta do mesmo usuário é recusada: 409', async () => {
  await criarConta(maria, 'maria@pix')
  const resposta = await criarConta(maria, 'outra@pix')

  assert.equal(resposta.status, 409)
  assert.equal(resposta.body.erro, 'você já tem uma conta')
})

test('campo faltando tem mensagem em português', async () => {
  const resposta = await request(app).post('/contas').set('Authorization', maria.autorizacao).send({})

  assert.equal(resposta.status, 400)
  assert.deepEqual(resposta.body.detalhes, [
    { campo: 'chave_pix', mensagem: 'chave_pix é obrigatória e deve ser texto' },
  ])
})

test('requisição sem corpo devolve 400, não 500', async () => {
  const resposta = await request(app).post('/contas').set('Authorization', maria.autorizacao)

  assert.equal(resposta.status, 400)
})

test('sem token devolve 401', async () => {
  const resposta = await request(app).post('/contas').send({ chave_pix: 'maria@pix' })

  assert.equal(resposta.status, 401)
  assert.deepEqual(resposta.body, { erro: 'token ausente' })
})

test('o banco recusa chave fora do padrão mesmo vinda de fora da API', async () => {
  await assert.rejects(
    pool.query(`INSERT INTO conta (usuario_id, chave_pix) VALUES (gen_random_uuid(), 'Maria@pix')`),
    { code: '23514' },
  )
})

// ─── GET /contas/minha ───────────────────────────────────────

test('GET /contas/minha devolve a conta de quem está logado', async () => {
  const criada = await criarConta(maria, 'maria@pix')
  const resposta = await request(app).get('/contas/minha').set('Authorization', maria.autorizacao)

  assert.equal(resposta.status, 200)
  assert.deepEqual(resposta.body, criada.body)
})

test('GET /contas/minha sem conta devolve 404', async () => {
  const resposta = await request(app).get('/contas/minha').set('Authorization', maria.autorizacao)

  assert.equal(resposta.status, 404)
  assert.equal(resposta.body.erro, 'você ainda não tem conta')
})

// ─── GET /contas/:id ─────────────────────────────────────────

test('GET /contas/:id devolve a própria conta', async () => {
  const criada = await criarConta(maria, 'maria@pix')
  const resposta = await request(app).get(`/contas/${criada.body.id}`).set('Authorization', maria.autorizacao)

  assert.equal(resposta.status, 200)
  assert.deepEqual(resposta.body, criada.body)
})

test('conta de outro usuário devolve 403', async () => {
  const criada = await criarConta(maria, 'maria@pix')
  const resposta = await request(app).get(`/contas/${criada.body.id}`).set('Authorization', novoUsuario().autorizacao)

  assert.equal(resposta.status, 403)
  assert.equal(resposta.body.erro, 'esta conta não é sua')
})

test('conta inexistente devolve 404', async () => {
  const resposta = await request(app)
    .get('/contas/00000000-0000-0000-0000-000000000000')
    .set('Authorization', maria.autorizacao)

  assert.equal(resposta.status, 404)
})

test('id que não é UUID devolve 404 (antes dava 500)', async () => {
  const resposta = await request(app).get('/contas/abc').set('Authorization', maria.autorizacao)

  assert.equal(resposta.status, 404)
  assert.equal(resposta.body.erro, 'conta não encontrada')
})
