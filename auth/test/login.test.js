import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import jwt from 'jsonwebtoken'

const nomeBanco = new URL(process.env.DATABASE_URL ?? 'postgres://x/sem-banco').pathname.slice(1)
if (!nomeBanco.endsWith('_test')) {
  console.error(`[testes] recusei rodar no banco "${nomeBanco}". Use um banco terminado em _test.`)
  process.exit(1)
}

const { criarApp } = await import('../src/app.js')
const { pool } = await import('../src/db.js')
const { config } = await import('../src/config.js')

const app = criarApp()
const usuario = { nome: 'Gabriel', email: 'gabriel@teste.com', cpf: '529.982.247-25', senha: 'senhaforte123' }

before(async () => {
  await pool.query('SELECT 1')
})

beforeEach(async () => {
  await pool.query('TRUNCATE usuario')
  await request(app).post('/auth/cadastro').send(usuario)
})

after(async () => {
  await pool.end()
})

test('login certo devolve um token com o id do usuário e validade de 1 hora', async () => {
  const resposta = await request(app)
    .post('/auth/login')
    .send({ email: usuario.email, senha: usuario.senha })

  assert.equal(resposta.status, 200)
  const conteudo = jwt.verify(resposta.body.token, config.JWT_SECRET)
  const { rows } = await pool.query('SELECT id FROM usuario')
  assert.equal(conteudo.sub, rows[0].id)
  assert.equal(conteudo.exp - conteudo.iat, 3600)
})

test('o token não carrega dados pessoais', async () => {
  const resposta = await request(app)
    .post('/auth/login')
    .send({ email: usuario.email, senha: usuario.senha })

  const conteudo = jwt.decode(resposta.body.token)
  assert.deepEqual(Object.keys(conteudo).sort(), ['exp', 'iat', 'sub'])
})

test('aceita o e-mail com maiúsculas e espaços', async () => {
  const resposta = await request(app)
    .post('/auth/login')
    .send({ email: '  GABRIEL@teste.com ', senha: usuario.senha })

  assert.equal(resposta.status, 200)
})

test('senha errada e e-mail inexistente devolvem a mesma resposta 401', async () => {
  const senhaErrada = await request(app)
    .post('/auth/login')
    .send({ email: usuario.email, senha: 'senhaerrada' })
  const emailInexistente = await request(app)
    .post('/auth/login')
    .send({ email: 'ninguem@teste.com', senha: 'qualquercoisa' })

  assert.equal(senhaErrada.status, 401)
  assert.equal(emailInexistente.status, 401)
  assert.deepEqual(senhaErrada.body, emailInexistente.body)
})

test('token assinado com outro segredo não passa na verificação', async () => {
  const falsificado = jwt.sign({ sub: 'qualquer-id' }, 'segredo-de-quem-quer-invadir-o-sistema')
  assert.throws(() => jwt.verify(falsificado, config.JWT_SECRET))
})

test('campos faltando devolvem 400', async () => {
  const resposta = await request(app).post('/auth/login').send({})
  assert.equal(resposta.status, 400)
})