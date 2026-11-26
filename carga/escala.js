import http from 'k6/http'
import { check, sleep } from 'k6'
import { SharedArray } from 'k6/data'
import encoding from 'k6/encoding'
import { Counter, Trend } from 'k6/metrics'
import { gerarUuid } from './uuid.js'

const baseUrl = (__ENV.BASE_URL || 'http://nginx')
  .replace(/\/+$/, '')

const totalContas = Number(__ENV.CONTAS_ESPERADAS || 10000)
const usuariosVirtuais = Number(__ENV.VUS || 500)
const duracaoSegundos = Number(__ENV.DURACAO_SEGUNDOS || 60)
const replicas = Number(__ENV.REPLICAS || 1)

if (!__ENV.ARQUIVO_USUARIOS) {
  throw new Error('Informe ARQUIVO_USUARIOS')
}

if (!Number.isInteger(totalContas) || totalContas < 2) {
  throw new Error('CONTAS_ESPERADAS deve ser um inteiro a partir de 2')
}

if (!Number.isInteger(usuariosVirtuais) || usuariosVirtuais < 1) {
  throw new Error('VUS deve ser um inteiro positivo')
}

if (
  !Number.isInteger(duracaoSegundos) ||
  duracaoSegundos < 1 ||
  duracaoSegundos > 300
) {
  throw new Error('DURACAO_SEGUNDOS deve estar entre 1 e 300')
}

if (![1, 2, 4].includes(replicas)) {
  throw new Error('REPLICAS deve ser 1, 2 ou 4')
}

const usuarios = new SharedArray('usuarios-escala', () => {
  const dados = JSON.parse(open(`./${__ENV.ARQUIVO_USUARIOS}`))

  if (dados.usuarios.length !== totalContas) {
    throw new Error(`Esperadas ${totalContas} contas`)
  }

  const contas = new Set()
  const validadeMinima = Date.now() / 1000 + duracaoSegundos + 90

  return dados.usuarios.map((usuario) => {
    if (
      !usuario.conta_id ||
      !usuario.chave_pix ||
      contas.has(usuario.conta_id)
    ) {
      throw new Error('Conta inválida ou repetida no arquivo')
    }

    contas.add(usuario.conta_id)

    let conteudo

    try {
      conteudo = JSON.parse(
        encoding.b64decode(usuario.token.split('.')[1], 'rawurl', 's'),
      )
    } catch {
      throw new Error('Token ausente ou em formato inválido')
    }

    if (
      conteudo.sub !== usuario.usuario_id ||
      !Number.isFinite(conteudo.exp) ||
      conteudo.exp < validadeMinima
    ) {
      throw new Error('Token incompatível ou próximo de expirar; renove o lote de tokens')
    }

    return {
      conta_id: usuario.conta_id,
      chave_pix: usuario.chave_pix,
      token: usuario.token,
    }
  })
})

const concluidos = new Counter('escala_pix_concluidos')
const recusados = new Counter('escala_saldo_insuficiente')
const inesperados = new Counter('escala_respostas_inesperadas')
const tempoPix = new Trend('escala_tempo_pix', true)

export const options = {
  scenarios: {
    escala: {
      executor: 'constant-vus',
      vus: usuariosVirtuais,
      duration: `${duracaoSegundos}s`,
      gracefulStop: '30s',
    },
  },
  tags: { replicas: String(replicas) },
  thresholds: {
    checks: ['rate==1'],
    'http_req_failed{operacao:pix_escala}': ['rate==0'],
    'http_reqs{operacao:pix_escala}': ['count>0'],
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
  for (const indice of [0, usuarios.length - 1]) {
    const usuario = usuarios[indice]

    const resposta = http.get(
      `${baseUrl}/contas/${usuario.conta_id}/saldo`,
      {
        headers: { Authorization: `Bearer ${usuario.token}` },
        tags: {
          operacao: 'preparacao',
          name: 'GET /contas/:id/saldo',
        },
        timeout: '30s',
      },
    )

    const corpo = lerJson(resposta)

    if (
      resposta.status !== 200 ||
      !Number.isSafeInteger(corpo?.saldo) ||
      corpo.saldo <= 0
    ) {
      throw new Error(
        `Preparação falhou: HTTP ${resposta.status}, confira token e saldo`,
      )
    }
  }
}

const statusEsperado = http.expectedStatuses(201)

export default function () {
  const indiceOrigem = Math.floor(Math.random() * usuarios.length)

  let indiceDestino = Math.floor(
    Math.random() * (usuarios.length - 1),
  )

  if (indiceDestino >= indiceOrigem) {
    indiceDestino++
  }

  const origem = usuarios[indiceOrigem]
  const destino = usuarios[indiceDestino]
  const valor = Math.floor(Math.random() * 100) + 1

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
        'Idempotency-Key': gerarUuid(),
      },
      tags: {
        operacao: 'pix_escala',
        name: 'POST /transferencias',
      },
      responseCallback: statusEsperado,
      timeout: '30s',
      redirects: 0,
    },
  )

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
  tempoPix.add(resposta.timings.duration)

  check(resposta, {
    'Pix de escala concluído corretamente': () => concluido,
  })

  sleep(0.1)
}