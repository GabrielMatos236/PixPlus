import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { app, pool, novoUsuario, limparBanco } from './apoio.js'

let maria
let joao

// Cria usuário, conta e, se pedir, um depósito inicial. Tudo pela API.
async function novaConta(chavePix, deposito = 0) {
  const usuario = novoUsuario()
  const { body: conta } = await request(app)
    .post('/contas')
    .set('Authorization', usuario.autorizacao)
    .send({ chave_pix: chavePix })
  if (deposito > 0) {
    await request(app)
      .post(`/contas/${conta.id}/depositos`)
      .set('Authorization', usuario.autorizacao)
      .send({ valor: deposito })
  }
  return { ...usuario, conta }
}

async function saldoDe(pessoa) {
  const { body } = await request(app)
    .get(`/contas/${pessoa.conta.id}/saldo`)
    .set('Authorization', pessoa.autorizacao)
  return body.saldo
}

function movimentar(campos = {}) {
  return request(app).post('/interno/movimentacoes').send({
    transferencia_id: randomUUID(),
    conta_origem: maria.conta.id,
    conta_destino: joao.conta.id,
    valor: 2500,
    ...campos,
  })
}

beforeEach(async () => {
  await limparBanco()
  maria = await novaConta('maria@pix', 10000) // R$ 100,00
  joao = await novaConta('joao@pix')
})

after(async () => {
  await pool.end()
})

// ─── Caminho feliz ───────────────────────────────────────────

test('movimenta, devolve 201 com o saldo novo da origem, sem token', async () => {
  const transferenciaId = randomUUID()
  const resposta = await movimentar({ transferencia_id: transferenciaId, valor: 2500 })

  assert.equal(resposta.status, 201)
  assert.deepEqual(resposta.body, { transferencia_id: transferenciaId, saldo_origem: 7500 })
  assert.equal(await saldoDe(maria), 7500)
  assert.equal(await saldoDe(joao), 2500)
})

test('débito e crédito ficam gravados com o mesmo transferencia_id', async () => {
  const transferenciaId = randomUUID()
  await movimentar({ transferencia_id: transferenciaId })

  const { rows } = await pool.query(
    `SELECT conta_id, tipo, valor FROM lancamento WHERE transferencia_id = $1 ORDER BY tipo`,
    [transferenciaId],
  )
  assert.deepEqual(rows, [
    { conta_id: maria.conta.id, tipo: 'debito', valor: 2500 },
    { conta_id: joao.conta.id, tipo: 'credito', valor: 2500 },
  ])
})

test('pode gastar o saldo inteiro, deixando zero', async () => {
  const resposta = await movimentar({ valor: 10000 })

  assert.equal(resposta.status, 201)
  assert.equal(resposta.body.saldo_origem, 0)
})

// ─── Recusas ─────────────────────────────────────────────────

test('saldo insuficiente devolve 422 e não grava nada', async () => {
  const resposta = await movimentar({ valor: 10001 })

  assert.equal(resposta.status, 422)
  assert.equal(resposta.body.erro, 'saldo insuficiente')
  assert.equal(await saldoDe(maria), 10000)
  assert.equal(await saldoDe(joao), 0)
})

test('conta de origem ou de destino inexistente devolve 404', async () => {
  const origem = await movimentar({ conta_origem: randomUUID() })
  assert.equal(origem.status, 404)
  assert.equal(origem.body.erro, 'conta de origem não encontrada')

  const destino = await movimentar({ conta_destino: randomUUID() })
  assert.equal(destino.status, 404)
  assert.equal(destino.body.erro, 'conta de destino não encontrada')

  assert.equal(await saldoDe(maria), 10000)
})

test('ids que não são UUID devolvem 400', async () => {
  const resposta = await movimentar({ transferencia_id: 'abc', conta_origem: 1, conta_destino: 2 })

  assert.equal(resposta.status, 400)
  assert.deepEqual(resposta.body.detalhes.map((d) => d.campo).sort(), [
    'conta_destino', 'conta_origem', 'transferencia_id',
  ])
})

test('valor zero, negativo, quebrado ou em texto devolve 400', async () => {
  for (const valor of [0, -100, 10.5, '2500']) {
    const resposta = await movimentar({ valor })

    assert.equal(resposta.status, 400, `valor ${valor}`)
    assert.equal(resposta.body.detalhes[0].campo, 'valor')
  }
})

test('origem igual ao destino devolve 400', async () => {
  const resposta = await movimentar({ conta_destino: maria.conta.id })

  assert.equal(resposta.status, 400)
  assert.deepEqual(resposta.body.detalhes, [
    { campo: 'conta_destino', mensagem: 'conta_destino deve ser diferente de conta_origem' },
  ])
})

test('corpo vazio devolve 400 com os quatro campos', async () => {
  const resposta = await request(app).post('/interno/movimentacoes').send({})

  assert.equal(resposta.status, 400)
  assert.equal(resposta.body.detalhes.length, 4)
})
