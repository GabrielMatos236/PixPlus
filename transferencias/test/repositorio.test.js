import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const nomeBanco = new URL(process.env.DATABASE_URL ?? 'postgres://x/sem-banco').pathname.slice(1)
if (!nomeBanco.endsWith('_test')) {
  console.error(`[testes] recusei rodar no banco "${nomeBanco}". Use um banco terminado em _test.`)
  process.exit(1)
}

const { pool } = await import('../src/db.js')
const repositorio = await import('../src/transferencias/repositorio.js')

function novaPendente(campos = {}) {
  return repositorio.criarPendente({
    chaveIdempotencia: randomUUID(),
    usuarioOrigem: randomUUID(),
    contaOrigem: randomUUID(),
    usuarioDestino: randomUUID(),
    contaDestino: randomUUID(),
    chaveDestino: 'joao@pix',
    valor: 2500,
    ...campos,
  })
}

async function eventosNaOutbox() {
  const { rows } = await pool.query('SELECT tipo, dados, status FROM outbox')
  return rows
}

beforeEach(async () => {
  await pool.query('TRUNCATE transferencia, outbox')
})

after(async () => {
  await pool.end()
})

test('criarPendente grava a transferência como pendente', async () => {
  const t = await novaPendente()

  assert.equal(t.status, 'pendente')
  assert.equal(t.valor, 2500)
  assert.equal(t.chave_destino, 'joao@pix')
})

test('concluir muda o status e grava o evento com os seis campos do contrato', async () => {
  const t = await novaPendente()

  const concluida = await repositorio.concluir(t.id)

  assert.equal(concluida.status, 'concluida')
  const eventos = await eventosNaOutbox()
  assert.equal(eventos.length, 1)
  assert.equal(eventos[0].tipo, 'transferencia.concluida')
  assert.equal(eventos[0].status, 'pendente') // o worker ainda vai entregar
  assert.deepEqual(eventos[0].dados, {
    transferencia_id: t.id,
    usuario_origem: t.usuario_origem,
    usuario_destino: t.usuario_destino,
    chave_destino: 'joao@pix',
    valor: 2500,
    concluida_em: concluida.atualizada_em.toISOString(),
  })
})

test('concluir duas vezes não grava o segundo evento', async () => {
  const t = await novaPendente()

  await repositorio.concluir(t.id)
  const segunda = await repositorio.concluir(t.id)

  assert.equal(segunda, null)
  assert.equal((await eventosNaOutbox()).length, 1)
})

test('se a outbox falha, o status também não muda (mesma transação)', async () => {
  const t = await novaPendente()
  // regra temporária que faz o INSERT na outbox falhar, depois do UPDATE do status
  await pool.query(`ALTER TABLE outbox ADD CONSTRAINT teste_quebra CHECK (tipo <> 'transferencia.concluida')`)
  try {
    await assert.rejects(repositorio.concluir(t.id))
  } finally {
    await pool.query('ALTER TABLE outbox DROP CONSTRAINT teste_quebra')
  }

  const depois = await repositorio.buscarPorId(t.id)
  assert.equal(depois.status, 'pendente')
  assert.equal((await eventosNaOutbox()).length, 0)
})

test('falhar grava o motivo e não gera evento', async () => {
  const t = await novaPendente()

  const falhou = await repositorio.falhar(t.id, 'saldo insuficiente')

  assert.equal(falhou.status, 'falhou')
  assert.equal(falhou.motivo_falha, 'saldo insuficiente')
  assert.equal((await eventosNaOutbox()).length, 0)
})

test('transferência concluída não pode virar falhou, nem o contrário', async () => {
  const a = await novaPendente()
  const b = await novaPendente()
  await repositorio.concluir(a.id)
  await repositorio.falhar(b.id, 'saldo insuficiente')

  assert.equal(await repositorio.falhar(a.id, 'qualquer'), null)
  assert.equal(await repositorio.concluir(b.id), null)
  assert.equal((await repositorio.buscarPorId(a.id)).status, 'concluida')
  assert.equal((await repositorio.buscarPorId(b.id)).status, 'falhou')
})

test('buscarPorId devolve null para id inexistente ou que não é UUID', async () => {
  assert.equal(await repositorio.buscarPorId(randomUUID()), null)
  assert.equal(await repositorio.buscarPorId('abc'), null)
})