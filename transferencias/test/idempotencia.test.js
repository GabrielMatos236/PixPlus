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
let ana

function pix(corpo, chave, quem = maria) {
  const pedido = request(app).post('/transferencias').set('Authorization', autorizacao(quem))
  if (chave !== undefined) pedido.set('Idempotency-Key', chave)
  return pedido.send(corpo)
}

async function transferenciasGravadas() {
  const { rows } = await pool.query('SELECT id, status FROM transferencia ORDER BY criada_em')
  return rows
}

async function quantosEventos() {
  const { rows: [{ total }] } = await pool.query('SELECT count(*)::int AS total FROM outbox')
  return total
}

before(async () => {
  await pool.query('SELECT 1')
})

beforeEach(async () => {
  await pool.query('TRUNCATE transferencia, outbox')
  contas.limpar()
  maria = contas.adicionarConta('maria@pix', 10000) // R$ 100,00
  joao = contas.adicionarConta('joao@pix')
  ana = contas.adicionarConta('ana@pix', 10000)
})

after(async () => {
  await pool.end()
  await contas.fechar()
})

// ─── O cabeçalho ─────────────────────────────────────────────

test('sem Idempotency-Key: 400, nada gravado e Contas nem é chamado', async () => {
  const resposta = await pix({ chave_destino: 'joao@pix', valor: 100 })

  assert.equal(resposta.status, 400)
  assert.equal(resposta.body.erro, 'o cabeçalho Idempotency-Key é obrigatório')
  assert.deepEqual(await transferenciasGravadas(), [])
  assert.deepEqual(contas.movimentacoes, [])
})

test('Idempotency-Key que não é UUID: 400', async () => {
  for (const chave of ['abc', '123', ' ', 'not-a-uuid-1234-5678-90ab-cdef00000000']) {
    const resposta = await pix({ chave_destino: 'joao@pix', valor: 100 }, chave)
    assert.equal(resposta.status, 400, JSON.stringify(chave))
  }
  assert.deepEqual(await transferenciasGravadas(), [])
})

// ─── Repetição do mesmo Pix ──────────────────────────────────

test('o mesmo Pix 3 vezes com a mesma chave: um débito só e a mesma transferência', async () => {
  const chave = randomUUID()
  const corpo = { chave_destino: 'joao@pix', valor: 2500 }

  const respostas = []
  for (let i = 0; i < 3; i++) respostas.push(await pix(corpo, chave))

  for (const resposta of respostas) {
    assert.equal(resposta.status, 201)
    assert.equal(resposta.body.status, 'concluida')
    assert.equal(resposta.body.id, respostas[0].body.id)
  }
  assert.equal(contas.movimentacoes.length, 1)
  assert.equal(maria.saldo, 7500)
  assert.equal(joao.saldo, 2500)
  assert.equal((await transferenciasGravadas()).length, 1)
  assert.equal(await quantosEventos(), 1) // um aviso só
})

test('a chave em maiúsculas é a mesma chave', async () => {
  const chave = randomUUID()
  const corpo = { chave_destino: 'joao@pix', valor: 100 }

  const primeira = await pix(corpo, chave)
  const segunda = await pix(corpo, chave.toUpperCase())

  assert.equal(segunda.status, 201)
  assert.equal(segunda.body.id, primeira.body.id)
  assert.equal(contas.movimentacoes.length, 1)
})

test('a chave normalizada conta como o mesmo Pix ("  JOAO@pix " = "joao@pix")', async () => {
  const chave = randomUUID()

  await pix({ chave_destino: 'joao@pix', valor: 100 }, chave)
  const repeticao = await pix({ chave_destino: '  JOAO@pix ', valor: 100 }, chave)

  assert.equal(repeticao.status, 201)
  assert.equal(contas.movimentacoes.length, 1)
})

test('repetir um Pix concluído funciona mesmo com Contas fora do ar', async () => {
  const chave = randomUUID()
  const corpo = { chave_destino: 'joao@pix', valor: 100 }
  const primeira = await pix(corpo, chave)

  contas.estado.foraDoAr = true
  const repeticao = await pix(corpo, chave)

  assert.equal(repeticao.status, 201)
  assert.equal(repeticao.body.id, primeira.body.id)
})

test('repetir um Pix que falhou devolve o mesmo 422 e não chama Contas de novo', async () => {
  const chave = randomUUID()
  const corpo = { chave_destino: 'joao@pix', valor: 999999 } // mais do que a Maria tem

  const primeira = await pix(corpo, chave)
  const repeticao = await pix(corpo, chave)

  assert.equal(primeira.status, 422)
  assert.equal(repeticao.status, 422)
  assert.equal(repeticao.body.erro, 'saldo insuficiente')
  assert.equal(contas.movimentacoes.length, 1)
  assert.equal(await quantosEventos(), 0)
})

test('repetir um Pix que ficou pendente: 202 com a transferência, sem mexer no dinheiro', async () => {
  const chave = randomUUID()
  const corpo = { chave_destino: 'joao@pix', valor: 100 }

  contas.estado.movimentacaoForaDoAr = true
  const primeira = await pix(corpo, chave)
  contas.estado.movimentacaoForaDoAr = false
  const repeticao = await pix(corpo, chave)

  assert.equal(primeira.status, 503)
  assert.equal(repeticao.status, 202)
  assert.equal(repeticao.body.status, 'pendente')
  assert.deepEqual(contas.movimentacoes, []) // a rotina de pendentes é quem termina esse
  assert.equal(maria.saldo, 10000)
})

test('mesma chave com outro valor ou outro destino: 422 e nada acontece', async () => {
  const chave = randomUUID()
  await pix({ chave_destino: 'joao@pix', valor: 100 }, chave)

  const outroValor = await pix({ chave_destino: 'joao@pix', valor: 200 }, chave)
  const outroDestino = await pix({ chave_destino: 'ana@pix', valor: 100 }, chave)

  for (const resposta of [outroValor, outroDestino]) {
    assert.equal(resposta.status, 422)
    assert.equal(resposta.body.erro, 'esta Idempotency-Key já foi usada em outro Pix')
  }
  assert.equal(contas.movimentacoes.length, 1)
  assert.equal(maria.saldo, 9900)
})

test('a mesma chave usada por duas pessoas são dois Pix diferentes', async () => {
  const chave = randomUUID()
  const corpo = { chave_destino: 'joao@pix', valor: 100 }

  const daMaria = await pix(corpo, chave, maria)
  const daAna = await pix(corpo, chave, ana)

  assert.equal(daMaria.status, 201)
  assert.equal(daAna.status, 201)
  assert.notEqual(daMaria.body.id, daAna.body.id)
  assert.equal(contas.movimentacoes.length, 2)
})

// ─── Mesma chave ao mesmo tempo ──────────────────────────────

test('5 pedidos simultâneos com a mesma chave: um débito só', async () => {
  // Segura as respostas de Contas: os 5 passam pela busca da chave antes de
  // qualquer um gravar, e 4 batem no UNIQUE do banco.
  contas.estado.atrasoMs = 100
  const chave = randomUUID()
  const corpo = { chave_destino: 'joao@pix', valor: 1000 }

  const respostas = await Promise.all(Array.from({ length: 5 }, () => pix(corpo, chave)))

  const status = respostas.map((r) => r.status).sort()
  // Um termina (201). Os outros chegaram enquanto ele rodava: 202 (pendente)
  // ou 201, se ele já tinha terminado. Nenhum 500, nenhum segundo débito.
  for (const s of status) assert.ok([201, 202].includes(s), `status ${s}`)
  assert.ok(status.includes(201))
  assert.equal(contas.movimentacoes.length, 1)
  assert.equal(maria.saldo, 9000)
  assert.equal((await transferenciasGravadas()).length, 1)
})

// ─── Alguém mexeu no status enquanto Contas trabalhava ───────

test('se a transferência já saiu de pendente, responde o que está gravado em vez de dar 500', async () => {
  // Simula a rotina de pendentes concluindo a transferência enquanto este
  // pedido ainda esperava Contas. O concluir() deste pedido devolve null.
  contas.estado.aoMovimentar = async ({ transferencia_id }) => {
    await pool.query("UPDATE transferencia SET status = 'concluida' WHERE id = $1", [transferencia_id])
  }

  const resposta = await pix({ chave_destino: 'joao@pix', valor: 100 }, randomUUID())

  assert.equal(resposta.status, 201)
  assert.equal(resposta.body.status, 'concluida')
  assert.equal(await quantosEventos(), 0) // quem concluiu é que grava o evento
})
