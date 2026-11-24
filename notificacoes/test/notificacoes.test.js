import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { app, pool, novoUsuario, limparBanco } from './apoio.js'

beforeEach(async () => {
  await limparBanco()
})

after(async () => {
  await pool.end()
})

function novoEvento(origem, destino) {
  return {
    id: randomUUID(),
    tipo: 'transferencia.concluida',
    dados: {
      transferencia_id: randomUUID(),
      usuario_origem: origem.id,
      usuario_destino: destino.id,
      chave_destino: 'destino@teste.example',
      valor: 2500,
      concluida_em: new Date().toISOString(),
    },
  }
}

async function enviarEvento(evento) {
  const resposta = await request(app)
    .post('/interno/eventos')
    .send(evento)

  assert.equal(resposta.status, 204)
}

test('listagem e marcação como lida exigem token', async () => {
  const lista = await request(app).get('/notificacoes')

  assert.equal(lista.status, 401)
  assert.equal(lista.body.erro, 'token ausente')

  const leitura = await request(app)
    .patch(`/notificacoes/${randomUUID()}`)
    .send({ lida: true })

  assert.equal(leitura.status, 401)
  assert.equal(leitura.body.erro, 'token ausente')
})

test('outro usuário recebe 404 e não altera o aviso', async () => {
  const origem = novoUsuario()
  const destino = novoUsuario()
  const outro = novoUsuario()

  await enviarEvento(novoEvento(origem, destino))

  const lista = await request(app)
    .get('/notificacoes')
    .set('Authorization', origem.autorizacao)

  assert.equal(lista.status, 200)
  assert.equal(lista.body.total, 1)

  const id = lista.body.notificacoes[0].id

  const tentativa = await request(app)
    .patch(`/notificacoes/${id}`)
    .set('Authorization', outro.autorizacao)
    .send({ lida: true })

  assert.equal(tentativa.status, 404)

  const resultado = await pool.query(
    'SELECT lida FROM notificacao WHERE id = $1',
    [id],
  )

  assert.equal(resultado.rows[0].lida, false)

  const leitura = await request(app)
    .patch(`/notificacoes/${id}`)
    .set('Authorization', origem.autorizacao)
    .send({ lida: true })

  assert.equal(leitura.status, 200)
  assert.equal(leitura.body.lida, true)
})

test('evento repetido mantém um aviso para cada usuário', async () => {
  const origem = novoUsuario()
  const destino = novoUsuario()
  const evento = novoEvento(origem, destino)

  await enviarEvento(evento)
  await enviarEvento(evento)

  for (const usuario of [origem, destino]) {
    const lista = await request(app)
      .get('/notificacoes')
      .set('Authorization', usuario.autorizacao)

    assert.equal(lista.status, 200)
    assert.equal(lista.body.total, 1)
    assert.equal(lista.body.notificacoes.length, 1)
  }

  const eventos = await pool.query(
    'SELECT count(*)::integer AS total FROM evento_recebido WHERE id = $1',
    [evento.id],
  )

  const avisos = await pool.query(
    'SELECT count(*)::integer AS total FROM notificacao WHERE evento_id = $1',
    [evento.id],
  )

  assert.equal(eventos.rows[0].total, 1)
  assert.equal(avisos.rows[0].total, 2)
})

test('exclusão exige token', async () => {
  const resposta = await request(app)
    .delete(`/notificacoes/${randomUUID()}`)

  assert.equal(resposta.status, 401)
  assert.equal(resposta.body.erro, 'token ausente')
})

test('dono exclui o aviso e reentrega não o recria', async () => {
  const origem = novoUsuario()
  const destino = novoUsuario()
  const evento = novoEvento(origem, destino)

  await enviarEvento(evento)

  const lista = await request(app)
    .get('/notificacoes')
    .set('Authorization', origem.autorizacao)

  assert.equal(lista.status, 200)
  assert.equal(lista.body.total, 1)

  const id = lista.body.notificacoes[0].id

  const exclusao = await request(app)
    .delete(`/notificacoes/${id}`)
    .set('Authorization', origem.autorizacao)

  assert.equal(exclusao.status, 204)
  assert.equal(exclusao.text, '')

  const repeticao = await request(app)
    .delete(`/notificacoes/${id}`)
    .set('Authorization', origem.autorizacao)

  assert.equal(repeticao.status, 404)

  const registro = await pool.query(
    'SELECT id FROM evento_recebido WHERE id = $1',
    [evento.id],
  )

  assert.equal(registro.rowCount, 1)

  await enviarEvento(evento)

  const listaOrigem = await request(app)
    .get('/notificacoes')
    .set('Authorization', origem.autorizacao)

  assert.equal(listaOrigem.status, 200)
  assert.equal(listaOrigem.body.total, 0)

  const listaDestino = await request(app)
    .get('/notificacoes')
    .set('Authorization', destino.autorizacao)

  assert.equal(listaDestino.status, 200)
  assert.equal(listaDestino.body.total, 1)
})

test('outro usuário não consegue excluir o aviso', async () => {
  const origem = novoUsuario()
  const destino = novoUsuario()
  const outro = novoUsuario()

  await enviarEvento(novoEvento(origem, destino))

  const lista = await request(app)
    .get('/notificacoes')
    .set('Authorization', origem.autorizacao)

  assert.equal(lista.status, 200)
  assert.equal(lista.body.total, 1)

  const id = lista.body.notificacoes[0].id

  const resposta = await request(app)
    .delete(`/notificacoes/${id}`)
    .set('Authorization', outro.autorizacao)

  assert.equal(resposta.status, 404)

  const registro = await pool.query(
    'SELECT usuario_id FROM notificacao WHERE id = $1',
    [id],
  )

  assert.equal(registro.rowCount, 1)
  assert.equal(registro.rows[0].usuario_id, origem.id)
})

test('exclusão de id inválido ou inexistente retorna 404', async () => {
  const usuario = novoUsuario()

  for (const id of ['invalido', randomUUID()]) {
    const resposta = await request(app)
      .delete(`/notificacoes/${id}`)
      .set('Authorization', usuario.autorizacao)

    assert.equal(resposta.status, 404)
  }
})