import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import argon2 from 'argon2'

// Trava de segurança: os testes apagam a tabela usuario. Só rodam num banco *_test.
const nomeBanco = new URL(process.env.DATABASE_URL ?? 'postgres://x/sem-banco').pathname.slice(1)
if (!nomeBanco.endsWith('_test')) {
  console.error(`[testes] recusei rodar no banco "${nomeBanco}". Use um banco terminado em _test.`)
  process.exit(1)
}

const { criarApp } = await import('../src/app.js')
const { pool } = await import('../src/db.js')

const app = criarApp()

const valido = {
  nome: 'Gabriel',
  email: 'gabriel@teste.com',
  cpf: '529.982.247-25', // CPF de exemplo com dígitos verificadores válidos
  senha: 'senhaforte123',
}

before(async () => {
  await pool.query('SELECT 1')
})

beforeEach(async () => {
  await pool.query('TRUNCATE usuario')
})

after(async () => {
  await pool.end()
})

test('cadastra e devolve 201 sem expor a senha', async () => {
  const resposta = await request(app).post('/auth/cadastro').send(valido)

  assert.equal(resposta.status, 201)
  assert.equal(resposta.body.nome, 'Gabriel')
  assert.equal(resposta.body.email, 'gabriel@teste.com')
  assert.match(resposta.body.id, /^[0-9a-f-]{36}$/)
  assert.equal(resposta.body.senha, undefined)
  assert.equal(resposta.body.senha_hash, undefined)
})

test('guarda a senha como hash argon2id e o cpf só com dígitos', async () => {
  await request(app).post('/auth/cadastro').send(valido)
  const { rows } = await pool.query('SELECT cpf, senha_hash FROM usuario')

  assert.equal(rows[0].cpf, '52998224725')
  assert.match(rows[0].senha_hash, /^\$argon2id\$/)
  assert.ok(await argon2.verify(rows[0].senha_hash, 'senhaforte123'))
})

test('normaliza o e-mail para minúsculas', async () => {
  const resposta = await request(app)
    .post('/auth/cadastro')
    .send({ ...valido, email: '  Gabriel@Teste.COM ' })

  assert.equal(resposta.status, 201)
  assert.equal(resposta.body.email, 'gabriel@teste.com')
})

test('e-mail repetido devolve 409, mesmo com letras maiúsculas', async () => {
  await request(app).post('/auth/cadastro').send(valido)
  const resposta = await request(app)
    .post('/auth/cadastro')
    .send({ ...valido, email: 'GABRIEL@teste.com', cpf: '111.444.777-35' })

  assert.equal(resposta.status, 409)
})

test('cpf repetido devolve 409, mesmo escrito de outro jeito', async () => {
  await request(app).post('/auth/cadastro').send(valido)
  const resposta = await request(app)
    .post('/auth/cadastro')
    .send({ ...valido, email: 'outro@teste.com', cpf: '52998224725' })

  assert.equal(resposta.status, 409)
})

test('cpf com dígito verificador errado devolve 400', async () => {
  const resposta = await request(app)
    .post('/auth/cadastro')
    .send({ ...valido, cpf: '529.982.247-26' })

  assert.equal(resposta.status, 400)
  assert.deepEqual(resposta.body.detalhes, [{ campo: 'cpf', mensagem: 'cpf inválido' }])
})

test('senha curta devolve 400', async () => {
  const resposta = await request(app)
    .post('/auth/cadastro')
    .send({ ...valido, senha: '1234567' })

  assert.equal(resposta.status, 400)
  assert.equal(resposta.body.detalhes[0].campo, 'senha')
})

test('campos faltando devolvem 400 listando cada um', async () => {
  const resposta = await request(app).post('/auth/cadastro').send({})

  assert.equal(resposta.status, 400)
  const campos = resposta.body.detalhes.map((d) => d.campo).sort()
  assert.deepEqual(campos, ['cpf', 'email', 'nome', 'senha'])
})

test('JSON malformado devolve 400, não 500', async () => {
  const resposta = await request(app)
    .post('/auth/cadastro')
    .set('Content-Type', 'application/json')
    .send('{"nome": ')

  assert.equal(resposta.status, 400)
})

test('dois cadastros iguais ao mesmo tempo: só um entra', async () => {
  const [a, b] = await Promise.all([
    request(app).post('/auth/cadastro').send(valido),
    request(app).post('/auth/cadastro').send(valido),
  ])

  assert.deepEqual([a.status, b.status].sort(), [201, 409])
  const { rows } = await pool.query('SELECT count(*)::int AS total FROM usuario')
  assert.equal(rows[0].total, 1)
})

test('saúde responde com o banco conectado', async () => {
  const resposta = await request(app).get('/auth/saude')
  assert.deepEqual(resposta.body, { servico: 'auth', banco: true })
})
