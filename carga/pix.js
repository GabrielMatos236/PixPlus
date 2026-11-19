import http from 'k6/http'
import { check, sleep } from 'k6'
import exec from 'k6/execution'
import { Counter, Trend } from 'k6/metrics'

const baseUrl = (__ENV.BASE_URL || 'http://nginx')
  .replace(/\/+$/, '')

if (!__ENV.ARQUIVO_USUARIOS) {
  throw new Error('Informe ARQUIVO_USUARIOS com o JSON das 20 contas')
}

const dados = JSON.parse(open(`./${__ENV.ARQUIVO_USUARIOS}`))

if (dados.usuarios.length !== 20) {
  throw new Error('O cenário exige exatamente 20 usuários')
}

const contasDistintas = new Set(
  dados.usuarios.map((usuario) => usuario.conta_id),
)

if (contasDistintas.size !== 20) {
  throw new Error('O arquivo precisa conter 20 contas diferentes')
}

const concluidos = new Counter('pix_concluidos')
const recusados = new Counter('pix_saldo_insuficiente')
const inesperados = new Counter('pix_respostas_inesperadas')
const tempoPix = new Trend('tempo_pix', true)
const statusEsperados = http.expectedStatuses(201, 422)

export const options = {
  setupTimeout: '2m',
  scenarios: {
    pix: {
      executor: 'constant-vus',
      vus: 500,
      duration: '30s',
      gracefulStop: '30s',
    },
  },
  thresholds: {
    checks: ['rate==1'],
    'http_req_failed{operacao:pix}': ['rate==0'],
    'http_reqs{operacao:pix}': ['count>0'],
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
  const usuarios = []

  for (const usuario of dados.usuarios) {
    const resposta = http.post(
      `${baseUrl}/auth/login`,
      JSON.stringify({
        email: usuario.email,
        senha: usuario.senha,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { operacao: 'login' },
        timeout: '30s',
      },
    )

    const corpo = lerJson(resposta)

    if (
      resposta.status !== 200 ||
      typeof corpo?.token !== 'string' ||
      !corpo.token
    ) {
      throw new Error(`Falha no login de preparação: HTTP ${resposta.status}`)
    }

    usuarios.push({
      conta_id: usuario.conta_id,
      chave_pix: usuario.chave_pix,
      token: corpo.token,
    })
  }

  return { usuarios }
}

export default function (dadosTeste) {
  const usuarios = dadosTeste.usuarios
  const indiceOrigem = (exec.vu.idInTest - 1) % usuarios.length

  let indiceDestino = Math.floor(
    Math.random() * (usuarios.length - 1),
  )

  if (indiceDestino >= indiceOrigem) {
    indiceDestino++
  }

  const origem = usuarios[indiceOrigem]
  const destino = usuarios[indiceDestino]
  const valor = Math.floor(Math.random() * 10000) + 1

  const resposta = http.post(
    `${baseUrl}/transferencias`,
    JSON.stringify({
      chave_destino: destino.chave_pix,
      valor,
    }),
    {
      headers: {
        Authorization: `Bearer ${origem.token}`,
        'Content-Type': 'application/json',
      },
      tags: { operacao: 'pix', name: 'POST /transferencias' },
      responseCallback: statusEsperados,
      timeout: '10s',
      redirects: 0,
    },
  )

  tempoPix.add(resposta.timings.duration)

  const corpo = lerJson(resposta)

  const concluido =
    resposta.status === 201 &&
    corpo?.status === 'concluida' &&
    corpo?.valor === valor &&
    corpo?.chave_destino === destino.chave_pix

  const saldoInsuficiente =
    resposta.status === 422 &&
    corpo?.erro === 'saldo insuficiente'

  concluidos.add(concluido ? 1 : 0)
  recusados.add(saldoInsuficiente ? 1 : 0)
  inesperados.add(!concluido && !saldoInsuficiente ? 1 : 0)

  check(resposta, {
    'Pix concluído ou recusado por saldo insuficiente':
      () => concluido || saldoInsuficiente,
  })

  sleep(0.1)
}