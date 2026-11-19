import http from 'k6/http'
import { check, fail } from 'k6'
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
  throw new Error('Use um lote com exatamente duas contas diferentes')
}

const valor = 100
const statusEsperados = http.expectedStatuses(200, 201)

export const options = {
  vus: 1,
  iterations: 1,
  setupTimeout: '1m',
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

function consultar(caminho, token) {
  const resposta = http.get(`${baseUrl}${caminho}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: '10s',
  })

  const corpo = lerJson(resposta)

  if (resposta.status !== 200 || !corpo) {
    fail(`Consulta falhou em ${caminho}: HTTP ${resposta.status}`)
  }

  return corpo
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

    const saldo = consultar(
      `/contas/${usuario.conta_id}/saldo`,
      corpo.token,
    ).saldo

    if (!Number.isSafeInteger(saldo)) {
      fail('Saldo inicial inválido')
    }

    return {
      conta_id: usuario.conta_id,
      chave_pix: usuario.chave_pix,
      token: corpo.token,
      saldoInicial: saldo,
    }
  })

  if (usuarios[0].saldoInicial < valor) {
    fail('A conta de origem precisa ter saldo para o Pix')
  }

  return { usuarios }
}

export default function (dadosTeste) {
  const [origem, destino] = dadosTeste.usuarios
  const chave = gerarUuid()
  let transferenciaId = null

  for (let envio = 1; envio <= 3; envio++) {
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
          'Idempotency-Key': chave,
        },
        responseCallback: statusEsperados,
        timeout: '10s',
        redirects: 0,
      },
    )

    const corpo = lerJson(resposta)

    const valido = check(resposta, {
      'envio retorna sucesso': (r) =>
        envio === 1 ? r.status === 201 : [200, 201].includes(r.status),

      'transferência está concluída': () =>
        corpo?.status === 'concluida',

      'valor e destino permanecem iguais': () =>
        corpo?.valor === valor &&
        corpo?.chave_destino === destino.chave_pix,

      'transferência possui identificador': () =>
        typeof corpo?.id === 'string' && corpo.id.length > 0,

      'repetição mantém o mesmo identificador': () =>
        transferenciaId === null || corpo?.id === transferenciaId,
    })

    if (!valido) {
      fail(`Envio ${envio} falhou: HTTP ${resposta.status}`)
    }

    transferenciaId = corpo.id
  }

  const saldoOrigem = consultar(
    `/contas/${origem.conta_id}/saldo`,
    origem.token,
  ).saldo

  const saldoDestino = consultar(
    `/contas/${destino.conta_id}/saldo`,
    destino.token,
  ).saldo

  check(null, {
    'origem foi debitada uma única vez': () =>
      saldoOrigem === origem.saldoInicial - valor,

    'destino foi creditado uma única vez': () =>
      saldoDestino === destino.saldoInicial + valor,
  })

  const extratoOrigem = consultar(
    `/contas/${origem.conta_id}/extrato?pagina=1&limite=100`,
    origem.token,
  )

  const extratoDestino = consultar(
    `/contas/${destino.conta_id}/extrato?pagina=1&limite=100`,
    destino.token,
  )

  if (
    !Array.isArray(extratoOrigem.lancamentos) ||
    !Array.isArray(extratoDestino.lancamentos)
  ) {
    fail('Extrato em formato inesperado')
  }

  const lancamentosOrigem = extratoOrigem.lancamentos.filter(
    (lancamento) => lancamento.transferencia_id === transferenciaId,
  )

  const lancamentosDestino = extratoDestino.lancamentos.filter(
    (lancamento) => lancamento.transferencia_id === transferenciaId,
  )

  check(null, {
    'extrato da origem contém apenas um débito': () =>
      lancamentosOrigem.length === 1 &&
      lancamentosOrigem[0].tipo === 'debito' &&
      lancamentosOrigem[0].valor === valor,

    'extrato do destino contém apenas um crédito': () =>
      lancamentosDestino.length === 1 &&
      lancamentosDestino[0].tipo === 'credito' &&
      lancamentosDestino[0].valor === valor,
  })

  console.log(JSON.stringify({
    chave_idempotencia: chave,
    transferencia_id: transferenciaId,
    envios: 3,
    saldo_origem: saldoOrigem,
    saldo_destino: saldoDestino,
  }))
}