import { test, before, beforeEach, after } from 'node:test'
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

function autorizacao(conta) {
  const token = jwt.sign({ sub: conta.usuario_id }, config.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' })
  return `Bearer ${token}`
}

let maria
let joao

function pix(corpo) {
  return request(app)
    .post('/transferencias')
    .set('Authorization', autorizacao(maria))
    .set('Idempotency-Key', randomUUID())
    .send(corpo)
}

async function statusGravados() {
  const { rows } = await pool.query('SELECT status FROM transferencia')
  return rows.map((r) => r.status)
}

before(async () => {
  await pool.query('SELECT 1')
})

beforeEach(async () => {
  await pool.query('TRUNCATE transferencia, outbox')
  contas.limpar()
  maria = contas.adicionarConta('maria@pix', 10000)
  joao = contas.adicionarConta('joao@pix')
})

after(async () => {
  await pool.end()
  await contas.fechar()
})

test('a busca de conta falha 2 vezes e responde na 3ª: o Pix conclui', async () => {
  contas.estado.falharProximas = 2 // as 2 primeiras chamadas a Contas tomam 503

  const resposta = await pix({ chave_destino: 'joao@pix', valor: 100 })

  assert.equal(resposta.status, 201)
  assert.equal(resposta.body.status, 'concluida')
  assert.equal(maria.saldo, 9900)
})

test('a movimentação falha 2 vezes e passa na 3ª: o Pix conclui com um débito só', async () => {
  contas.estado.movimentacaoFalharProximas = 2

  const resposta = await pix({ chave_destino: 'joao@pix', valor: 100 })

  assert.equal(resposta.status, 201)
  assert.equal(resposta.body.status, 'concluida')
  assert.equal(contas.movimentacoes.length, 1) // as 2 recusadas nem chegaram a mover
  assert.equal(maria.saldo, 9900)
})

test('Contas fora do ar nas 3 tentativas da movimentação: 503 e a transferência fica pendente', async () => {
  contas.estado.movimentacaoForaDoAr = true

  const resposta = await pix({ chave_destino: 'joao@pix', valor: 100 })

  assert.equal(resposta.status, 503)
  assert.deepEqual(await statusGravados(), ['pendente'])
  assert.equal(maria.saldo, 10000)
})

test('Contas moveu o dinheiro mas passou dos 2 s: a nova tentativa só confirma, sem debitar de novo', async () => {
  let primeira = true
  contas.estado.depoisDeMovimentar = async () => {
    if (primeira) {
      primeira = false
      await new Promise((resolve) => setTimeout(resolve, 2300)) // passa do tempo limite
    }
  }

  const resposta = await pix({ chave_destino: 'joao@pix', valor: 2500 })

  assert.equal(resposta.status, 201)
  assert.equal(resposta.body.status, 'concluida')
  assert.equal(maria.saldo, 7500) // debitado uma vez só
  assert.equal(joao.saldo, 2500)
  assert.equal(contas.movimentacoes.length, 2) // a original e a repetição
})
