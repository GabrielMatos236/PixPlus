import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { criarContasFalso } from './contasFalso.js'

const nomeBanco = new URL(process.env.DATABASE_URL ?? 'postgres://x/sem-banco').pathname.slice(1)
if (!nomeBanco.endsWith('_test')) {
  console.error(`[testes] recusei rodar no banco "${nomeBanco}". Use um banco terminado em _test.`)
  process.exit(1)
}

// O Contas falso sobe primeiro: o config.js lê CONTAS_URL na hora do import.
const contas = await criarContasFalso()
process.env.CONTAS_URL = contas.url

const { pool } = await import('../src/db.js')
const { reprocessarPendentes } = await import('../src/pendentes/rotina.js')

let maria
let joao

// Grava uma transferência pendente "parada" há `idadeSegundos`.
// Direto no INSERT: o trigger só mexe em atualizada_em nos UPDATEs.
async function pendente({ valor = 100, idadeSegundos = 120 } = {}) {
  const { rows: [t] } = await pool.query(
    `INSERT INTO transferencia
       (chave_idempotencia, usuario_origem, conta_origem, usuario_destino, conta_destino,
        chave_destino, valor, criada_em, atualizada_em)
     VALUES ($1, $2, $3, $4, $5, 'joao@pix', $6,
             now() - make_interval(secs => $7), now() - make_interval(secs => $7))
     RETURNING *`,
    [randomUUID(), maria.usuario_id, maria.id, joao.usuario_id, joao.id, valor, idadeSegundos],
  )
  return t
}

async function buscar(id) {
  const { rows: [t] } = await pool.query('SELECT * FROM transferencia WHERE id = $1', [id])
  return t
}

async function eventos() {
  const { rows } = await pool.query('SELECT dados FROM outbox')
  return rows.map((r) => r.dados)
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

test('pendente parada há mais de 1 minuto: a rotina conclui e grava o evento do aviso', async () => {
  const t = await pendente({ valor: 2500 })

  const resumo = await reprocessarPendentes()

  assert.equal(resumo.concluidas, 1)
  assert.equal((await buscar(t.id)).status, 'concluida')
  assert.equal(maria.saldo, 7500)
  const [evento] = await eventos()
  assert.equal(evento.transferencia_id, t.id)
  assert.equal(evento.valor, 2500)
})

test('Contas já tinha movido o dinheiro: a rotina só conclui, sem debitar de novo', async () => {
  const t = await pendente({ valor: 2500 })
  // O POST original chegou a mover o dinheiro, mas caiu antes de gravar "concluida".
  contas.marcarComoMovida(t.id)
  maria.saldo = 7500
  joao.saldo = 2500

  const resumo = await reprocessarPendentes()

  assert.equal(resumo.concluidas, 1)
  assert.equal((await buscar(t.id)).status, 'concluida')
  assert.equal(maria.saldo, 7500) // continua debitado uma vez só
  assert.equal(joao.saldo, 2500)
  assert.equal((await eventos()).length, 1) // e o aviso, que antes nunca saía, sai
})

test('pendente recente (menos de 1 minuto) não é mexida: o POST pode ainda estar rodando', async () => {
  const t = await pendente({ idadeSegundos: 10 })

  const resumo = await reprocessarPendentes()

  assert.equal(resumo.reservadas, 0)
  assert.equal((await buscar(t.id)).status, 'pendente')
  assert.deepEqual(contas.movimentacoes, [])
})

test('Contas recusa (saldo insuficiente): vira falhou com o motivo e sem evento', async () => {
  const t = await pendente({ valor: 999999 })

  const resumo = await reprocessarPendentes()

  assert.equal(resumo.falharam, 1)
  const gravada = await buscar(t.id)
  assert.equal(gravada.status, 'falhou')
  assert.equal(gravada.motivo_falha, 'saldo insuficiente')
  assert.deepEqual(await eventos(), [])
})

test('Contas ainda fora do ar: continua pendente e só volta daqui a 1 minuto', async () => {
  const t = await pendente()
  contas.estado.movimentacaoForaDoAr = true

  const resumo = await reprocessarPendentes()
  assert.equal(resumo.continuamPendentes, 1)
  assert.equal((await buscar(t.id)).status, 'pendente')

  // Rodando de novo logo em seguida, ela não é pega: foi "reservada" agora.
  contas.estado.movimentacaoForaDoAr = false
  const deNovo = await reprocessarPendentes()
  assert.equal(deNovo.reservadas, 0)
})

test('duas réplicas rodando ao mesmo tempo: cada transferência é processada uma vez só', async () => {
  for (let i = 0; i < 20; i++) await pendente({ valor: 100 })
  contas.estado.atrasoMs = 20 // as duas rodadas se cruzam

  const [a, b] = await Promise.all([reprocessarPendentes(), reprocessarPendentes()])

  assert.equal(a.reservadas + b.reservadas, 20)
  assert.equal(a.concluidas + b.concluidas, 20)
  assert.equal(contas.movimentacoes.length, 20) // nenhuma chamada repetida
  assert.equal(maria.saldo, 8000)
  assert.equal((await eventos()).length, 20)
})

test('transferências que já terminaram não são tocadas', async () => {
  const t = await pendente()
  await pool.query("UPDATE transferencia SET status = 'concluida' WHERE id = $1", [t.id])

  const resumo = await reprocessarPendentes()

  assert.equal(resumo.reservadas, 0)
  assert.deepEqual(contas.movimentacoes, [])
})
