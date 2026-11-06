import http from 'k6/http'
import { check, sleep } from 'k6'
import exec from 'k6/execution'
import { Trend } from 'k6/metrics'

const baseUrl = __ENV.BASE_URL || 'http://host.docker.internal'

if (!__ENV.ARQUIVO_USUARIOS) {
  throw new Error('Informe ARQUIVO_USUARIOS com o nome do JSON do seed')
}

const dados = JSON.parse(open(`./${__ENV.ARQUIVO_USUARIOS}`))

if (dados.usuarios.length < 200) {
  throw new Error('O arquivo precisa conter pelo menos 200 usuários')
}

const tempoLogin = new Trend('tempo_login', true)
const tempoSaldo = new Trend('tempo_saldo', true)

export const options = {
  scenarios: {
    login_saldo: {
      executor: 'constant-vus',
      vus: 200,
      duration: '30s',
      gracefulStop: '30s',
    },
  },
  thresholds: {
    checks: ['rate==1'],
    http_req_failed: ['rate==0'],
  },
}

function lerJson(resposta) {
  try {
    return resposta.json()
  } catch {
    return null
  }
}

export default function () {
  const usuario = dados.usuarios[exec.vu.idInTest - 1]

  const login = http.post(
    `${baseUrl}/auth/login`,
    JSON.stringify({
      email: usuario.email,
      senha: usuario.senha,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'login' },
      timeout: '30s',
    },
  )

  tempoLogin.add(login.timings.duration)

  const corpoLogin = lerJson(login)

  const loginValido = check(login, {
    'login retorna 200': (resposta) => resposta.status === 200,
    'login retorna token': () =>
      typeof corpoLogin?.token === 'string' &&
      corpoLogin.token.length > 0,
  })

  if (!loginValido) {
    sleep(1)
    return
  }

  const saldo = http.get(
    `${baseUrl}/contas/${usuario.conta_id}/saldo`,
    {
      headers: {
        Authorization: `Bearer ${corpoLogin.token}`,
      },
      tags: { name: 'saldo' },
      timeout: '30s',
    },
  )

  tempoSaldo.add(saldo.timings.duration)

  const corpoSaldo = lerJson(saldo)

  check(saldo, {
    'saldo retorna 200': (resposta) => resposta.status === 200,
    'saldo permanece igual ao depósito': () =>
      corpoSaldo?.saldo === dados.deposito,
  })

  sleep(1)
}