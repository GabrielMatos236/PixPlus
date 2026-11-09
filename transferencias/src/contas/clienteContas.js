import { config } from '../config.js'
import { ErroHttp } from '../erros.js'

// Cliente HTTP do serviço Contas. É o único arquivo de Transferências que sabe
// os caminhos /interno/... de Contas: as rotas do Pix só chamam as funções daqui.
//
// Regra geral das respostas:
// - Contas não respondeu (fora do ar, timeout) ou respondeu 5xx → ErroHttp 503
// - Contas respondeu um "não" esperado (404, 422) → cada função decide o que vira
// - Qualquer outra coisa é bug nosso (corpo errado, rota errada) → Error comum, vira 500

const TEMPO_LIMITE_MS = 2000

async function chamarContas(caminho, { method = 'GET', corpo } = {}) {
  let resposta
  try {
    resposta = await fetch(`${config.CONTAS_URL}${caminho}`, {
      method,
      headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    })
  } catch {
    // não conectou, DNS falhou ou passou de 2 s
    throw new ErroHttp(503, 'serviço de contas indisponível')
  }

  if (resposta.status >= 500) {
    await resposta.body?.cancel()
    throw new ErroHttp(503, 'serviço de contas indisponível')
  }

  const dados = await resposta.json().catch(() => null)
  return { status: resposta.status, dados }
}

function respostaInesperada(caminho, status, dados) {
  return new Error(`Contas respondeu ${status} em ${caminho}: ${JSON.stringify(dados)}`)
}

// Conta de quem está mandando o Pix (o usuário do token).
export async function buscarContaDoUsuario(usuarioId) {
  const caminho = `/interno/contas?usuario_id=${encodeURIComponent(usuarioId)}`
  const { status, dados } = await chamarContas(caminho)

  if (status === 200) return dados // { id, usuario_id }
  if (status === 404) throw new ErroHttp(422, 'você ainda não tem conta')
  throw respostaInesperada(caminho, status, dados)
}

// Conta dona da chave Pix de destino.
export async function buscarContaPorChave(chave) {
  const caminho = `/interno/contas?chave=${encodeURIComponent(chave)}`
  const { status, dados } = await chamarContas(caminho)

  if (status === 200) return dados // { id, usuario_id }
  if (status === 404) throw new ErroHttp(404, 'chave pix não encontrada')
  throw respostaInesperada(caminho, status, dados)
}

// Débito na origem e crédito no destino, feitos por Contas.
// Não lança erro quando Contas recusa: devolve o motivo, porque a transferência
// precisa ser gravada como "falhou" com esse motivo.
// Se Contas estiver fora do ar, lança 503 e a transferência fica pendente.
export async function movimentar({ transferenciaId, contaOrigem, contaDestino, valor }) {
  const caminho = '/interno/movimentacoes'
  const { status, dados } = await chamarContas(caminho, {
    method: 'POST',
    corpo: {
      transferencia_id: transferenciaId,
      conta_origem: contaOrigem,
      conta_destino: contaDestino,
      valor,
    },
  })

  if (status === 201) return { concluida: true }
  if (status === 422 || status === 404) return { concluida: false, motivo: dados?.erro ?? 'recusada por contas' }
  throw respostaInesperada(caminho, status, dados)
}