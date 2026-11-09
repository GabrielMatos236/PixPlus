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

// Usuário logado, como o Auth faria no login: um token com o id no "sub".
function autorizacao(conta) {
  const token = jwt.sign({ sub: conta.usuario_id }, config.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' })
  return `Bearer ${token}`
}

let maria
let joao

function pix(corpo, quem = maria) {
  return request(app).post('/transferencias').set('Authorization', autorizacao(quem)).send(corpo)
}

async function transferenciasGravadas() {
  const { rows } = await pool.query('SELECT status, motivo_falha FROM transferencia')
  return rows
}

async function eventosNaOutbox() {
  const { rows } = await pool.query('SELECT dados FROM outbox')
  return rows.map((r) => r.dados)
}

before(async () => {
  await pool.query('SELECT 1')
})

beforeEach(async () => {
  await pool.query('TRUNCATE transferencia, outbox')
  contas.limpar()
  maria = contas.adicionarConta('maria@pix', 10000) // R$ 100,00
  joao = contas.adicionarConta('joao@pix')
})

after(async () => {
  await pool.end()
  await contas.fechar()
})

// ─── POST /transferencias: caminho feliz ─────────────────────

test('Pix concluído: 201, dinheiro movido e evento na outbox', async () => {
  const resposta = await pix({ chave_destino: 'joao@pix', valor: 2500 })

  assert.equal(resposta.status, 201)
  assert.equal(resposta.body.status, 'concluida')
  assert.equal(resposta.body.chave_destino, 'joao@pix')
  assert.equal(resposta.body.valor, 2500)
  assert.equal(resposta.body.motivo_falha, null)

  assert.equal(maria.saldo, 7500)
  assert.equal(joao.saldo, 2500)

  const eventos = await eventosNaOutbox()
  assert.equal(eventos.length, 1)
  assert.equal(eventos[0].transferencia_id, resposta.body.id)
  assert.equal(eventos[0].usuario_origem, maria.usuario_id)
  assert.equal(eventos[0].usuario_destino, joao.usuario_id)
})

test('Contas recebe a movimentação com o id da transferência e as duas contas', async () => {
  const resposta = await pix({ chave_destino: 'joao@pix', valor: 2500 })

  assert.deepEqual(contas.movimentacoes, [{
    transferencia_id: resposta.body.id,
    conta_origem: maria.id,
    conta_destino: joao.id,
    valor: 2500,
  }])
})

test('a resposta não mostra ids de conta nem de usuário', async () => {
  const resposta = await pix({ chave_destino: 'joao@pix', valor: 2500 })

  assert.deepEqual(Object.keys(resposta.body).sort(), [
    'atualizada_em', 'chave_destino', 'criada_em', 'id', 'motivo_falha', 'status', 'valor',
  ])
})

test('a chave é normalizada como em Contas', async () => {
  const resposta = await pix({ chave_destino: '  Joao@PIX ', valor: 100 })

  assert.equal(resposta.status, 201)
  assert.equal(resposta.body.chave_destino, 'joao@pix')
})

// ─── POST /transferencias: recusas ───────────────────────────

test('saldo insuficiente: 422, transferência gravada como falhou e sem evento', async () => {
  const resposta = await pix({ chave_destino: 'joao@pix', valor: 10001 })

  assert.equal(resposta.status, 422)
  assert.equal(resposta.body.erro, 'saldo insuficiente')
  assert.deepEqual(await transferenciasGravadas(), [{ status: 'falhou', motivo_falha: 'saldo insuficiente' }])
  assert.deepEqual(await eventosNaOutbox(), [])
  assert.equal(maria.saldo, 10000)
})

test('chave inexistente: 404 e nada gravado', async () => {
  const resposta = await pix({ chave_destino: 'ninguem@pix', valor: 100 })

  assert.equal(resposta.status, 404)
  assert.equal(resposta.body.erro, 'chave pix não encontrada')
  assert.deepEqual(await transferenciasGravadas(), [])
})

test('quem não tem conta recebe 422', async () => {
  const semConta = { usuario_id: randomUUID() }
  const resposta = await pix({ chave_destino: 'joao@pix', valor: 100 }, semConta)

  assert.equal(resposta.status, 422)
  assert.equal(resposta.body.erro, 'você ainda não tem conta')
})

test('Pix para a própria chave: 422 e nada gravado', async () => {
  const resposta = await pix({ chave_destino: 'maria@pix', valor: 100 })

  assert.equal(resposta.status, 422)
  assert.equal(resposta.body.erro, 'não dá para mandar Pix para a própria conta')
  assert.deepEqual(await transferenciasGravadas(), [])
})

test('Contas fora do ar antes de tudo: 503 e nada gravado', async () => {
  contas.estado.foraDoAr = true

  const resposta = await pix({ chave_destino: 'joao@pix', valor: 100 })

  assert.equal(resposta.status, 503)
  assert.equal(resposta.body.erro, 'serviço de contas indisponível')
  assert.deepEqual(await transferenciasGravadas(), [])
})

test('Contas cai na movimentação: 503 e a transferência fica pendente', async () => {
  contas.estado.movimentacaoForaDoAr = true

  const resposta = await pix({ chave_destino: 'joao@pix', valor: 100 })

  assert.equal(resposta.status, 503)
  assert.deepEqual(await transferenciasGravadas(), [{ status: 'pendente', motivo_falha: null }])
  assert.deepEqual(await eventosNaOutbox(), [])
})

test('corpo inválido devolve 400 com o campo certo', async () => {
  const casos = [
    [{ chave_destino: 'joao@pix', valor: 0 }, 'valor'],
    [{ chave_destino: 'joao@pix', valor: 10.5 }, 'valor'],
    [{ chave_destino: 'joao@pix', valor: '100' }, 'valor'],
    [{ chave_destino: 'joao@pix', valor: 100_000_001 }, 'valor'],
    [{ chave_destino: '   ', valor: 100 }, 'chave_destino'],
    [{ valor: 100 }, 'chave_destino'],
  ]
  for (const [corpo, campo] of casos) {
    const resposta = await pix(corpo)

    assert.equal(resposta.status, 400, JSON.stringify(corpo))
    assert.equal(resposta.body.detalhes[0].campo, campo, JSON.stringify(corpo))
  }
  assert.deepEqual(contas.movimentacoes, [])
})

// ─── GET /transferencias/:id ─────────────────────────────────

test('quem enviou consulta a transferência', async () => {
  const { body: criada } = await pix({ chave_destino: 'joao@pix', valor: 2500 })

  const resposta = await request(app)
    .get(`/transferencias/${criada.id}`)
    .set('Authorization', autorizacao(maria))

  assert.equal(resposta.status, 200)
  assert.deepEqual(resposta.body, criada)
})

test('a consulta de um Pix que falhou mostra o motivo', async () => {
  await pix({ chave_destino: 'joao@pix', valor: 99999 })
  const { rows: [{ id }] } = await pool.query('SELECT id FROM transferencia')

  const resposta = await request(app)
    .get(`/transferencias/${id}`)
    .set('Authorization', autorizacao(maria))

  assert.equal(resposta.status, 200)
  assert.equal(resposta.body.status, 'falhou')
  assert.equal(resposta.body.motivo_falha, 'saldo insuficiente')
})

test('quem recebeu (ou qualquer outro) não consulta: 403', async () => {
  const { body: criada } = await pix({ chave_destino: 'joao@pix', valor: 2500 })

  const resposta = await request(app)
    .get(`/transferencias/${criada.id}`)
    .set('Authorization', autorizacao(joao))

  assert.equal(resposta.status, 403)
  assert.equal(resposta.body.erro, 'esta transferência não é sua')
})

test('id inexistente ou que não é UUID: 404', async () => {
  for (const id of [randomUUID(), 'abc']) {
    const resposta = await request(app)
      .get(`/transferencias/${id}`)
      .set('Authorization', autorizacao(maria))

    assert.equal(resposta.status, 404, id)
    assert.equal(resposta.body.erro, 'transferência não encontrada')
  }
})
