import http from 'k6/http'
import { check, fail } from 'k6'
import { Counter, Trend } from 'k6/metrics'
import { gerarUuid } from './uuid.js'

const baseUrl = (__ENV.BASE_URL || 'http://nginx')
  .replace(/\/+$/, '')

if (!__ENV.ARQUIVO_USUARIOS) {
  throw new Error('Informe ARQUIVO_USUARIOS com o JSON de duas contas')
}

const dados = JSON.parse(open(`./${__ENV.ARQUIVO_USUARIOS}`))

if (
  dados.usuarios.length !== 2 ||
  dados.usuarios[0].conta_id === dados.usuarios[1].conta_id
) {
  throw new Error('Use exatamente duas contas diferentes')
}

const totalPares = 1000
const valor = 100

const pares = new Counter('cruzado_pares')
const concluidos = new Counter('cruzado_concluidos')
const falhas = new Counter('cruzado_falhas')
const tempo = new Trend('cruzado_tempo', true)

export const options = {
  setupTimeout: '1m',
  teardownTimeout: '1m',
  batch: 2,
  batchPerHost: 2,
  scenarios: {
    cruzado: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: totalPares,
      maxDuration: '15m',
      gracefulStop: '30s',
    },
  },
  thresholds: {
    checks: ['rate==1'],
    http_req_failed: ['rate==0'],
    cruzado_pares: ['count==1000'],
    cruzado_concluidos: ['count==2000'],
  },
}

function lerJson(resposta) {
  try {
    return resposta.json()
  } catch {
    return null
  }
}

function consultarSaldo(usuario) {
  const resposta = http.get(
    `${baseUrl}/contas/${usuario.conta_id}/saldo`,
    {
      headers: { Authorization: `Bearer ${usuario.token}` },
      timeout: '10s',
    },
  )

  const corpo = lerJson(resposta)

  if (
    resposta.status !== 200 ||
    !Number.isSafeInteger(corpo?.saldo)
  ) {
    fail(`Consulta de saldo falhou: HTTP ${resposta.status}`)
  }

  return corpo.saldo
}

export function setup() {
  const usuarios = dados.usuarios.map((usuario) => {
    const resposta = http.post(
      `${baseUrl}/auth/login`,
      JSON.stringify({
        email: usuario.email,
        senha: usuario.senha,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: '10s',
      },
    )

    const corpo = lerJson(resposta)

    if (
      resposta.status !== 200 ||
      typeof corpo?.token !== 'string' ||
      !corpo.token
    ) {
      fail(`Login de preparação falhou: HTTP ${resposta.status}`)
    }

    const preparado = {
      conta_id: usuario.conta_id,
      chave_pix: usuario.chave_pix,
      token: corpo.token,
    }

    preparado.saldoInicial = consultarSaldo(preparado)

    if (preparado.saldoInicial < totalPares * valor) {
      fail('Cada conta precisa de pelo menos 100000 centavos')
    }

    return preparado
  })

  return { usuarios }
}

function montarEnvio(origem, destino, sentido) {
  return {
    method: 'POST',
    url: `${baseUrl}/transferencias`,
    body: JSON.stringify({
      chave_destino: destino.chave_pix,
      valor,
    }),
    params: {
      headers: {
        Authorization: `Bearer ${origem.token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': gerarUuid(),
      },
      tags: {
        name: 'POST /transferencias',
        operacao: 'pix_cruzado',
        sentido,
      },
      responseCallback: http.expectedStatuses(201),
      timeout: '10s',
      redirects: 0,
    },
  }
}

let falhaRegistrada = false

export default function (dadosTeste) {
  const [contaA, contaB] = dadosTeste.usuarios

  const respostas = http.batch([
    montarEnvio(contaA, contaB, 'a_para_b'),
    montarEnvio(contaB, contaA, 'b_para_a'),
  ])

  pares.add(1)

  const destinos = [contaB, contaA]
  const identificadores = []

  respostas.forEach((resposta, indice) => {
    const corpo = lerJson(resposta)

    const correto =
      resposta.status === 201 &&
      corpo?.status === 'concluida' &&
      corpo?.valor === valor &&
      corpo?.chave_destino === destinos[indice].chave_pix &&
      typeof corpo?.id === 'string' &&
      corpo.id.length > 0

    check(resposta, {
      'Pix cruzado conclui com valor e destino corretos': () => correto,
    })

    concluidos.add(correto ? 1 : 0)
    falhas.add(correto ? 0 : 1)
    tempo.add(resposta.timings.duration)

    identificadores.push(corpo?.id)

    if (!correto && !falhaRegistrada) {
      falhaRegistrada = true

      console.warn(JSON.stringify({
        status: resposta.status,
        erro: corpo?.erro || resposta.error || 'resposta inesperada',
        sentido: indice === 0 ? 'a_para_b' : 'b_para_a',
      }))
    }
  })

  check(null, {
    'os dois Pix têm identificadores diferentes': () =>
      typeof identificadores[0] === 'string' &&
      typeof identificadores[1] === 'string' &&
      identificadores[0] !== identificadores[1],
  })
}

export function teardown(dadosTeste) {
  const [contaA, contaB] = dadosTeste.usuarios

  const saldoA = consultarSaldo(contaA)
  const saldoB = consultarSaldo(contaB)

  check(null, {
    'soma dos saldos foi preservada': () =>
      saldoA + saldoB === contaA.saldoInicial + contaB.saldoInicial,

    'nenhuma das duas contas terminou negativa': () =>
      saldoA >= 0 && saldoB >= 0,

    'saldo de A voltou ao valor inicial': () =>
      saldoA === contaA.saldoInicial,

    'saldo de B voltou ao valor inicial': () =>
      saldoB === contaB.saldoInicial,
  })

  console.log(JSON.stringify({
    pares_planejados: totalPares,
    pix_esperados: totalPares * 2,
    saldos_iniciais: [contaA.saldoInicial, contaB.saldoInicial],
    saldos_finais: [saldoA, saldoB],
  }))
}