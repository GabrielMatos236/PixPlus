import { writeFile } from 'node:fs/promises'

const baseUrl = (process.env.BASE_URL || 'http://localhost')
  .replace(/\/+$/, '')

const quantidade = Number(process.argv[2] || 10)
const deposito = Number(process.argv[3] || 10000)

if (
  !Number.isInteger(quantidade) ||
  quantidade < 1 ||
  quantidade > 10000
) {
  throw new Error('A quantidade deve ser um inteiro entre 1 e 10000')
}

if (
  !Number.isInteger(deposito) ||
  deposito < 1 ||
  deposito > 100000000
) {
  throw new Error('O depósito deve ser um inteiro entre 1 e 100000000 centavos')
}

function gerarCpf(numero) {
  const digitos = String(numero).split('').map(Number)

  for (let tamanho = 9; tamanho <= 10; tamanho++) {
    let soma = 0

    for (let i = 0; i < tamanho; i++) {
      soma += digitos[i] * (tamanho + 1 - i)
    }

    const resto = (soma * 10) % 11
    digitos.push(resto === 10 ? 0 : resto)
  }

  return digitos.join('')
}

async function chamarApi(caminho, corpo, statusEsperado, token) {
  const headers = { 'Content-Type': 'application/json' }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const resposta = await fetch(`${baseUrl}${caminho}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(30000),
  })

  if (resposta.status !== statusEsperado) {
    throw new Error(
      `${caminho}: HTTP ${resposta.status} — ${await resposta.text()}`,
    )
  }

  return resposta.json()
}

const lote = Date.now()
const nomeArquivo = `usuarios-seed-${lote}.json`
const arquivo = new URL(`./${nomeArquivo}`, import.meta.url)
const usuarios = []

async function salvarUsuarios() {
  await writeFile(
    arquivo,
    JSON.stringify({ baseUrl, deposito, usuarios }, null, 2),
    'utf8',
  )
}

await writeFile(
  arquivo,
  JSON.stringify({ baseUrl, deposito, usuarios }, null, 2),
  { encoding: 'utf8', flag: 'wx' },
)

console.log(`Arquivo de dados: carga/${nomeArquivo}`)

for (let indice = 0; indice < quantidade; indice++) {
  const email = `seed.${lote}.${indice}@teste.example`
  const senha = 'SenhaSeed123!'
  const numeroCpf = 800000000 + ((lote + indice) % 10000000)

  const usuario = await chamarApi('/auth/cadastro', {
    nome: `Usuario Seed ${indice}`,
    email,
    cpf: gerarCpf(numeroCpf),
    senha,
  }, 201)

  const login = await chamarApi('/auth/login', {
    email,
    senha,
  }, 200)

  const conta = await chamarApi('/contas/', {
    chave_pix: email,
  }, 201, login.token)

  await chamarApi(`/contas/${conta.id}/depositos`, {
    valor: deposito,
  }, 201, login.token)

  usuarios.push({
    usuario_id: usuario.id,
    conta_id: conta.id,
    chave_pix: conta.chave_pix,
    email,
    senha,
  })

  await salvarUsuarios()

  console.log(`${indice + 1}/${quantidade}: conta criada e depósito realizado`)
}

console.log(`Seed concluído: ${usuarios.length} usuários com conta e depósito.`)