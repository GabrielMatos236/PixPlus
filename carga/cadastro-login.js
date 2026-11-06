import http from 'k6/http'
import { check } from 'k6'
import exec from 'k6/execution'

const baseUrl = __ENV.BASE_URL || 'http://host.docker.internal'

export const options = {
  scenarios: {
    cadastro_login: {
      executor: 'shared-iterations',
      vus: 10,
      iterations: 100,
      maxDuration: '5m',
    },
  },
  thresholds: {
    checks: ['rate==1'],
    http_req_failed: ['rate==0'],
  },
}

export function setup() {
  return { lote: Date.now() }
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

export default function (dados) {
  const indice = exec.scenario.iterationInTest
  const email = `carga.${dados.lote}.${indice}@teste.example`
  const senha = 'SenhaCarga123!'
  const numeroCpf = 900000000 + ((dados.lote + indice) % 10000000)

  const parametros = {
    headers: { 'Content-Type': 'application/json' },
    timeout: '30s',
  }

  const cadastro = http.post(
    `${baseUrl}/auth/cadastro`,
    JSON.stringify({
      nome: `Usuario Carga ${indice}`,
      email,
      cpf: gerarCpf(numeroCpf),
      senha,
    }),
    { ...parametros, tags: { name: 'cadastro' } },
  )

  const cadastrado = check(cadastro, {
    'cadastro retorna 201': (resposta) => resposta.status === 201,
  })

  if (!cadastrado) {
    console.error(`Cadastro ${indice}: HTTP ${cadastro.status}`)
    return
  }

  const login = http.post(
    `${baseUrl}/auth/login`,
    JSON.stringify({ email, senha }),
    { ...parametros, tags: { name: 'login' } },
  )

  check(login, {
    'login retorna 200': (resposta) => resposta.status === 200,
    'login retorna token': (resposta) => {
      try {
        const token = resposta.json('token')
        return typeof token === 'string' && token.length > 0
      } catch {
        return false
      }
    },
  })
}