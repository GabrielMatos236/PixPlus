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
const { ErroHttp } = await import('../src/erros.js')
const { criarVerificadorFirebase } = await import('../src/firebase/verificador.js')

// Firebase de mentira: cada "token" é só o nome de uma pessoa da lista.
// O de verdade confere assinatura e validade com as chaves do Google.
const contasFirebase = {
  'token-maria-google': { uid: 'uid-maria', email: 'maria@gmail.com', nome: 'Maria Silva' },
  'token-ana-email': { uid: 'uid-ana', email: 'ana@teste.com', nome: undefined },
  'token-nome-curto': { uid: 'uid-x', email: 'x@teste.com', nome: 'X' },
  'token-sem-email': { uid: 'uid-sem-email', email: undefined, nome: 'Sem Email' },
  'token-gabriel': { uid: 'uid-gabriel', email: 'gabriel@teste.com', nome: 'Gabriel' },
}
async function verificadorFalso(idToken) {
  const conta = contasFirebase[idToken]
  if (!conta) throw new ErroHttp(401, 'token do firebase inválido ou expirado')
  return conta
}

const app = criarApp({ verificarTokenFirebase: verificadorFalso })

const CPF_1 = '529.982.247-25'
const CPF_2 = '111.444.777-35'

function entrar(corpo) {
  return request(app).post('/auth/firebase').send(corpo)
}

async function usuarios() {
  const { rows } = await pool.query(
    'SELECT id, nome, email, cpf, firebase_uid, senha_hash FROM usuario ORDER BY criado_em',
  )
  return rows
}

before(async () => {
  await pool.query('SELECT 1')
})

beforeEach(async () => {
  await pool.query('TRUNCATE usuario')
})

after(async () => {
  await pool.end()
})

// ─── Primeiro acesso ─────────────────────────────────────────

test('primeiro acesso com Google e CPF: cria o usuário e devolve 201 com o nosso JWT', async () => {
  const resposta = await entrar({ idToken: 'token-maria-google', cpf: CPF_1 })

  assert.equal(resposta.status, 201)
  const [usuario] = await usuarios()
  assert.deepEqual(
    { ...usuario, id: undefined },
    { id: undefined, nome: 'Maria Silva', email: 'maria@gmail.com', cpf: '52998224725', firebase_uid: 'uid-maria', senha_hash: null },
  )
  const conteudo = jwt.verify(resposta.body.token, config.JWT_SECRET)
  assert.equal(conteudo.sub, usuario.id)
  assert.equal(conteudo.exp - conteudo.iat, 3600)
})

test('o nome digitado tem prioridade sobre o nome do Google', async () => {
  await entrar({ idToken: 'token-maria-google', nome: 'Maria S.', cpf: CPF_1 })

  assert.equal((await usuarios())[0].nome, 'Maria S.')
})

test('primeiro acesso sem CPF: 422 pedindo o CPF, nada criado', async () => {
  const resposta = await entrar({ idToken: 'token-maria-google' })

  assert.equal(resposta.status, 422)
  assert.equal(resposta.body.erro, 'complete o cadastro')
  assert.deepEqual(resposta.body.detalhes, [{ campo: 'cpf', mensagem: 'informe o cpf' }])
  assert.deepEqual(await usuarios(), [])
})

test('e-mail e senha do Firebase não trazem nome: 422 pedindo nome e CPF', async () => {
  const resposta = await entrar({ idToken: 'token-ana-email' })

  assert.equal(resposta.status, 422)
  assert.deepEqual(resposta.body.detalhes.map((d) => d.campo), ['nome', 'cpf'])
})

test('nome do Google fora da regra (1 letra) é tratado como ausente', async () => {
  const resposta = await entrar({ idToken: 'token-nome-curto', cpf: CPF_1 })

  assert.equal(resposta.status, 422)
  assert.deepEqual(resposta.body.detalhes.map((d) => d.campo), ['nome'])
})

test('conta do Firebase sem e-mail: 422', async () => {
  const resposta = await entrar({ idToken: 'token-sem-email', cpf: CPF_1 })

  assert.equal(resposta.status, 422)
  assert.equal(resposta.body.erro, 'a conta do firebase precisa ter e-mail')
})

// ─── Acessos seguintes ───────────────────────────────────────

test('segundo acesso: só o idToken basta, 200 com o mesmo usuário', async () => {
  const primeiro = await entrar({ idToken: 'token-maria-google', cpf: CPF_1 })
  const segundo = await entrar({ idToken: 'token-maria-google' })

  assert.equal(segundo.status, 200)
  assert.equal(jwt.decode(segundo.body.token).sub, jwt.decode(primeiro.body.token).sub)
  assert.equal((await usuarios()).length, 1)
})

test('no segundo acesso, nome e CPF do corpo são ignorados', async () => {
  await entrar({ idToken: 'token-maria-google', cpf: CPF_1 })
  await entrar({ idToken: 'token-maria-google', nome: 'Outro Nome', cpf: CPF_2 })

  const [usuario] = await usuarios()
  assert.equal(usuario.nome, 'Maria Silva')
  assert.equal(usuario.cpf, '52998224725')
})

test('dois primeiros acessos ao mesmo tempo criam um usuário só, e os dois entram', async () => {
  const [a, b] = await Promise.all([
    entrar({ idToken: 'token-maria-google', cpf: CPF_1 }),
    entrar({ idToken: 'token-maria-google', cpf: CPF_1 }),
  ])

  assert.deepEqual([a.status, b.status].sort(), [200, 201])
  assert.equal(jwt.decode(a.body.token).sub, jwt.decode(b.body.token).sub)
  assert.equal((await usuarios()).length, 1)
})

test('o JWT de quem entrou pelo Firebase funciona no GET /auth/eu', async () => {
  const { body } = await entrar({ idToken: 'token-maria-google', cpf: CPF_1 })

  const resposta = await request(app).get('/auth/eu').set('Authorization', `Bearer ${body.token}`)

  assert.equal(resposta.status, 200)
  assert.equal(resposta.body.email, 'maria@gmail.com')
})

// ─── Recusas ─────────────────────────────────────────────────

test('token do Firebase inválido: 401, nada criado', async () => {
  const resposta = await entrar({ idToken: 'token-falsificado', cpf: CPF_1 })

  assert.equal(resposta.status, 401)
  assert.equal(resposta.body.erro, 'token do firebase inválido ou expirado')
  assert.deepEqual(await usuarios(), [])
})

test('e-mail que já tem cadastro com senha: 409, e a conta antiga não é ligada ao Firebase', async () => {
  await request(app).post('/auth/cadastro').send({
    nome: 'Gabriel', email: 'gabriel@teste.com', cpf: CPF_2, senha: 'senhaforte123',
  })

  const resposta = await entrar({ idToken: 'token-gabriel', cpf: CPF_1 })

  assert.equal(resposta.status, 409)
  assert.equal(resposta.body.erro, 'e-mail já cadastrado')
  const [usuario] = await usuarios()
  assert.equal(usuario.firebase_uid, null)
})

test('CPF de outra pessoa: 409', async () => {
  await entrar({ idToken: 'token-maria-google', cpf: CPF_1 })

  const resposta = await entrar({ idToken: 'token-ana-email', nome: 'Ana', cpf: CPF_1 })

  assert.equal(resposta.status, 409)
  assert.equal(resposta.body.erro, 'cpf já cadastrado')
})

test('corpo inválido: 400 com o campo certo', async () => {
  const casos = [
    [{}, 'idToken'],
    [{ idToken: '' }, 'idToken'],
    [{ idToken: 123 }, 'idToken'],
    [{ idToken: 'token-maria-google', cpf: '123' }, 'cpf'],
    [{ idToken: 'token-maria-google', nome: 'A', cpf: CPF_1 }, 'nome'],
  ]
  for (const [corpo, campo] of casos) {
    const resposta = await entrar(corpo)

    assert.equal(resposta.status, 400, JSON.stringify(corpo))
    assert.equal(resposta.body.detalhes[0].campo, campo, JSON.stringify(corpo))
  }
})

test('quem entrou pelo Firebase não entra pelo /auth/login (não tem senha aqui)', async () => {
  await entrar({ idToken: 'token-maria-google', cpf: CPF_1 })

  const resposta = await request(app)
    .post('/auth/login')
    .send({ email: 'maria@gmail.com', senha: 'qualquercoisa' })

  assert.equal(resposta.status, 401)
  assert.equal(resposta.body.erro, 'e-mail ou senha incorretos')
})

test('cadastro com senha usando o e-mail de quem entrou pelo Firebase: 409', async () => {
  await entrar({ idToken: 'token-maria-google', cpf: CPF_1 })

  const resposta = await request(app).post('/auth/cadastro').send({
    nome: 'Maria', email: 'maria@gmail.com', cpf: CPF_2, senha: 'senhaforte123',
  })

  assert.equal(resposta.status, 409)
})

test('o banco recusa usuário sem senha e sem Firebase', async () => {
  await assert.rejects(
    pool.query(`INSERT INTO usuario (nome, email, cpf) VALUES ('Ninguém', 'n@teste.com', '52998224725')`),
    /usuario_tem_como_entrar/,
  )
})

// ─── O verificador de verdade ────────────────────────────────

test('sem FIREBASE_PROJECT_ID, a rota responde 503 e o resto do Auth segue', async () => {
  const semFirebase = criarApp({ verificarTokenFirebase: criarVerificadorFirebase(undefined) })

  const resposta = await request(semFirebase).post('/auth/firebase').send({ idToken: 'qualquer' })

  assert.equal(resposta.status, 503)
  assert.equal(resposta.body.erro, 'login pelo firebase não configurado no servidor')
})

test('o verificador de verdade recusa token malformado com 401, sem internet', async () => {
  const verificar = criarVerificadorFirebase('demo-pixplus')

  await assert.rejects(verificar('isto-nao-e-um-jwt'), (erro) => erro.status === 401)
})
