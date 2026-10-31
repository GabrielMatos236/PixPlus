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
let token

before(async () => {
  await pool.query('SELECT 1')
})

beforeEach(async () => {
  await pool.query('TRUNCATE usuario')
  await request(app).post('/auth/cadastro').send(usuario)
  const login = await request(app)
    .post('/auth/login')
    .send({ email: usuario.email, senha: usuario.senha })
  token = login.body.token
})

after(async () => {
  await pool.end()
})

test('com token válido devolve os dados de quem está logado, sem a senha', async () => {
  const resposta = await request(app).get('/auth/eu').set('Authorization', `Bearer ${token}`)

  assert.equal(resposta.status, 200)
  assert.equal(resposta.body.email, usuario.email)
  assert.equal(resposta.body.nome, usuario.nome)
  assert.equal(resposta.body.senha_hash, undefined)
  assert.equal(resposta.body.cpf, undefined)
})

test('sem token devolve 401', async () => {
  const resposta = await request(app).get('/auth/eu')

  assert.equal(resposta.status, 401)
  assert.equal(resposta.body.erro, 'token ausente')
})

test('cabeçalho sem a palavra Bearer devolve 401', async () => {
  const resposta = await request(app).get('/auth/eu').set('Authorization', token)

  assert.equal(resposta.status, 401)
})

test('token assinado com outro segredo devolve 401', async () => {
  const falsificado = jwt.sign({ sub: 'qualquer-id' }, 'segredo-de-quem-quer-invadir-o-sistema')
  const resposta = await request(app).get('/auth/eu').set('Authorization', `Bearer ${falsificado}`)

  assert.equal(resposta.status, 401)
  assert.equal(resposta.body.erro, 'token inválido')
})

test('token adulterado (conteúdo trocado, assinatura antiga) devolve 401', async () => {
  const [cabecalho, , assinatura] = token.split('.')
  const conteudoFalso = Buffer.from(JSON.stringify({ sub: 'id-de-outra-pessoa' })).toString('base64url')
  const adulterado = `${cabecalho}.${conteudoFalso}.${assinatura}`

  const resposta = await request(app).get('/auth/eu').set('Authorization', `Bearer ${adulterado}`)
  assert.equal(resposta.status, 401)
})

test('token sem assinatura (alg: none) devolve 401', async () => {
  const cabecalho = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const conteudo = Buffer.from(JSON.stringify({ sub: 'qualquer-id' })).toString('base64url')

  const resposta = await request(app).get('/auth/eu').set('Authorization', `Bearer ${cabecalho}.${conteudo}.`)
  assert.equal(resposta.status, 401)
})

test('token vencido devolve 401 com a mensagem certa', async () => {
  const { rows } = await pool.query('SELECT id FROM usuario')
  const vencido = jwt.sign({ sub: rows[0].id, exp: Math.floor(Date.now() / 1000) - 60 }, config.JWT_SECRET)

  const resposta = await request(app).get('/auth/eu').set('Authorization', `Bearer ${vencido}`)
  assert.equal(resposta.status, 401)
  assert.equal(resposta.body.erro, 'token expirado')
})

test('token válido de um usuário que não existe mais devolve 404', async () => {
  await pool.query('TRUNCATE usuario')

  const resposta = await request(app).get('/auth/eu').set('Authorization', `Bearer ${token}`)
  assert.equal(resposta.status, 404)
})

test('o navegador pode mandar o cabeçalho Authorization (preflight do CORS)', async () => {
  const resposta = await request(app)
    .options('/auth/eu')
    .set('Origin', 'http://localhost:5173')
    .set('Access-Control-Request-Method', 'GET')
    .set('Access-Control-Request-Headers', 'Authorization')

  assert.equal(resposta.status, 200)
  assert.match(resposta.headers['access-control-allow-headers'], /Authorization/i)
})
