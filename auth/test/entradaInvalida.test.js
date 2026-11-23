import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'

// Trava de segurança: só roda num banco *_test.
const nomeBanco = new URL(process.env.DATABASE_URL ?? 'postgres://x/sem-banco').pathname.slice(1)
if (!nomeBanco.endsWith('_test')) {
  console.error(`[testes] recusei rodar no banco "${nomeBanco}". Use um banco terminado em _test.`)
  process.exit(1)
}

const { criarApp } = await import('../src/app.js')
const { pool } = await import('../src/db.js')

// Verificador falso: estes testes não chegam a falar com o Google.
const app = criarApp({ verificarTokenFirebase: async () => ({ uid: 'uid-teste', email: 'ana@teste.com' }) })

after(async () => {
  await pool.end()
})

// O Postgres recusa \u0000 em TEXT. Antes da trava, isso estourava no INSERT e virava 500.
test('nome com caractere nulo no cadastro devolve 400, não 500', async () => {
  const resposta = await request(app).post('/auth/cadastro').send({
    nome: 'Ana\u0000',
    email: 'ana@teste.com',
    cpf: '529.982.247-25',
    senha: 'senhaforte123',
  })
  assert.equal(resposta.status, 400)
  assert.match(resposta.body.erro, /caractere nulo/)
})

test('nome com caractere nulo no primeiro acesso pelo Firebase devolve 400, não 500', async () => {
  const resposta = await request(app).post('/auth/firebase').send({
    idToken: 'token-qualquer',
    nome: 'Ana\u0000Paula',
    cpf: '52998224725',
  })
  assert.equal(resposta.status, 400)
  assert.match(resposta.body.erro, /caractere nulo/)
})
