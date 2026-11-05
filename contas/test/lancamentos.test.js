import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app, pool, novoUsuario, limparBanco } from './apoio.js'

let maria
let conta

function depositar(valor, usuario = maria, contaId = conta.id) {
  return request(app)
    .post(`/contas/${contaId}/depositos`)
    .set('Authorization', usuario.autorizacao)
    .send({ valor })
}

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

// ─── Depósito ────────────────────────────────────────────────

test('depósito vira um lançamento de crédito', async () => {
  const resposta = await depositar(2500)

  assert.equal(resposta.status, 201)
  assert.equal(resposta.body.conta_id, conta.id)
  assert.equal(resposta.body.tipo, 'credito')
  assert.equal(resposta.body.valor, 2500)
  assert.equal(resposta.body.transferencia_id, null)
})

test('depósito acima de R$ 1 milhão é recusado (antes estourava o INTEGER com 500)', async () => {
  const resposta = await depositar(3_000_000_000)

  assert.equal(resposta.status, 400)
  assert.deepEqual(resposta.body.detalhes, [
    { campo: 'valor', mensagem: 'valor máximo por depósito é R$ 1.000.000,00' },
  ])
})

test('depósito de exatamente R$ 1 milhão é aceito', async () => {
  const resposta = await depositar(100_000_000)
  assert.equal(resposta.status, 201)
})

test('valor inválido tem mensagem em português', async () => {
  for (const [valor, mensagem] of [
    [undefined, 'valor é obrigatório e deve ser número'],
    ['100', 'valor é obrigatório e deve ser número'],
    [10.5, 'valor deve ser inteiro (centavos)'],
    [0, 'valor deve ser maior que zero'],
  ]) {
    const resposta = await depositar(valor)
    assert.equal(resposta.status, 400, `valor ${valor}`)
    assert.equal(resposta.body.detalhes[0].mensagem, mensagem)
  }
})

test('depósito na conta de outro usuário devolve 403', async () => {
  const resposta = await depositar(2500, novoUsuario())
  assert.equal(resposta.status, 403)
})

// ─── Saldo ───────────────────────────────────────────────────

test('saldo é a soma dos créditos menos a dos débitos', async () => {
  await depositar(10000)
  await depositar(500)
  await pool.query(`INSERT INTO lancamento (conta_id, tipo, valor) VALUES ($1, 'debito', 2500)`, [conta.id])

  const resposta = await request(app).get(`/contas/${conta.id}/saldo`).set('Authorization', maria.autorizacao)

  assert.equal(resposta.status, 200)
  assert.deepEqual(resposta.body, { conta_id: conta.id, saldo: 8000 })
})

test('conta nova tem saldo zero', async () => {
  const resposta = await request(app).get(`/contas/${conta.id}/saldo`).set('Authorization', maria.autorizacao)
  assert.equal(resposta.body.saldo, 0)
})

// ─── Extrato ─────────────────────────────────────────────────

test('extrato vem do mais novo para o mais antigo, paginado', async () => {
  for (const valor of [100, 200, 300]) await depositar(valor)

  const resposta = await request(app)
    .get(`/contas/${conta.id}/extrato?pagina=1&limite=2`)
    .set('Authorization', maria.autorizacao)

  assert.equal(resposta.status, 200)
  assert.deepEqual(resposta.body.lancamentos.map((l) => l.valor), [300, 200])
  assert.equal(resposta.body.total, 3)
  assert.equal(resposta.body.paginas, 2)
})

test('lançamentos no mesmo instante não repetem nem somem entre páginas', async () => {
  // Uma transação só: todos os lançamentos ganham o mesmo now() em criado_em.
  await pool.query(
    `INSERT INTO lancamento (conta_id, tipo, valor)
     SELECT $1, 'credito', n FROM generate_series(1, 30) AS n`,
    [conta.id],
  )

  const vistos = []
  for (let pagina = 1; pagina <= 6; pagina++) {
    const resposta = await request(app)
      .get(`/contas/${conta.id}/extrato?pagina=${pagina}&limite=5`)
      .set('Authorization', maria.autorizacao)
    vistos.push(...resposta.body.lancamentos.map((l) => l.id))
  }

  assert.equal(vistos.length, 30)
  assert.equal(new Set(vistos).size, 30)
})

test('paginação inválida devolve 400 em português', async () => {
  const resposta = await request(app)
    .get(`/contas/${conta.id}/extrato?limite=500`)
    .set('Authorization', maria.autorizacao)

  assert.equal(resposta.status, 400)
  assert.deepEqual(resposta.body.detalhes, [{ campo: 'limite', mensagem: 'limite máximo é 100' }])
})
