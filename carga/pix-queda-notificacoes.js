import http from 'k6/http'
import { check, fail } from 'k6'
import { Counter, Trend } from 'k6/metrics'
import { gerarUuid } from './uuid.js'

const baseUrl = (__ENV.BASE_URL || 'http://nginx')
  .replace(/\/+$/, '')

if (!__ENV.ARQUIVO_USUARIOS) {
  throw new Error('Informe o JSON das duas contas exclusivas do teste')
}

const dados = JSON.parse(open(`./${__ENV.ARQUIVO_USUARIOS}`))

if (
  dados.usuarios.length !== 2 ||
  dados.usuarios[0].conta_id === dados.usuarios[1].conta_id
) {
  throw new Error('O teste exige duas contas diferentes')
}

const totalPix = 1000
const valor = 1

const concluidos = new Counter('queda_pix_concluidos')
const falhas = new Counter('queda_pix_falhas')
const tempo = new Trend('queda_tempo_pix', true)

export const options = {
  setupTimeout: '1m',
  scenarios: {
    queda_notificacoes: {
      executor: 'shared-iterations',
      vus: 10,
      iterations: totalPix,
      maxDuration: '10m',
      gracefulStop: '30s',
    },
  },
  thresholds: {
    checks: ['rate==1'],
    http_req_failed: ['rate==0'],
    queda_pix_concluidos: ['count==1000'],
  },
}

function lerJson(resposta) {
  try {
    return resposta.json()
  } catch {
    return null
  }
}

export function setup() {
  const [origem, destino] = dados.usuarios

  const login = http.post(
    `${baseUrl}/auth/login`,
    JSON.stringify({
      email: origem.email,
      senha: origem.senha,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: '30s',
    },
  )

  const corpo = lerJson(login)

  if (
    login.status !== 200 ||
    typeof corpo?.token !== 'string' ||
    !corpo.token
  ) {
    fail(`Login de preparação falhou: HTTP ${login.status}`)
  }

  const respostaSaldo = http.get(
    `${baseUrl}/contas/${origem.conta_id}/saldo`,
    {
      headers: { Authorization: `Bearer ${corpo.token}` },
      timeout: '30s',
    },
  )

  const saldo = lerJson(respostaSaldo)?.saldo

  if (
    respostaSaldo.status !== 200 ||
    !Number.isSafeInteger(saldo) ||
    saldo < totalPix * valor
  ) {
    fail('A origem não possui saldo suficiente para os 1000 Pix')
  }

  return {
    token: corpo.token,
    chaveDestino: destino.chave_pix,
  }
}

let falhaRegistrada = false

export default function (dadosTeste) {
  const resposta = http.post(
    `${baseUrl}/transferencias`,
    JSON.stringify({
      chave_destino: dadosTeste.chaveDestino,
      valor,
    }),
    {
      headers: {
        Authorization: `Bearer ${dadosTeste.token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': gerarUuid(),
      },
      tags: {
        name: 'POST /transferencias',
        operacao: 'pix_queda_notificacoes',
      },
      responseCallback: http.expectedStatuses(201),
      timeout: '30s',
      redirects: 0,
    },
  )

  const corpo = lerJson(resposta)

  const correto =
    resposta.status === 201 &&
    corpo?.status === 'concluida' &&
    corpo?.valor === valor &&
    corpo?.chave_destino === dadosTeste.chaveDestino &&
    typeof corpo?.id === 'string' &&
    corpo.id.length > 0

  check(resposta, {
    'Pix conclui durante a indisponibilidade de Notificações':
      () => correto,
  })

  concluidos.add(correto ? 1 : 0)
  falhas.add(correto ? 0 : 1)
  tempo.add(resposta.timings.duration)

  if (!correto && !falhaRegistrada) {
    falhaRegistrada = true

    console.warn(JSON.stringify({
      status: resposta.status,
      erro: corpo?.erro || resposta.error || 'resposta inesperada',
    }))
  }
}