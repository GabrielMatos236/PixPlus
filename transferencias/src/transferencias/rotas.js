import { Router } from 'express'
import { config } from '../config.js'
import { criarValidarToken } from '../autenticacao/validarToken.js'
import { ErroHttp } from '../erros.js'
import { esquemaPix, lerChaveIdempotencia, validar } from './validacao.js'
import {
  criarPendente,
  concluir,
  falhar,
  buscarPorId,
  buscarPorChaveIdempotencia,
} from './repositorio.js'
import { buscarContaDoUsuario, buscarContaPorChave, movimentar } from '../contas/clienteContas.js'

export const rotasTransferencias = Router()
const validarToken = criarValidarToken(config.JWT_SECRET)
const DUPLICADO = '23505' // código do Postgres para violação de UNIQUE

rotasTransferencias.use('/transferencias', validarToken)

// O que o cliente vê de uma transferência. Ids de conta e de usuário ficam de fora:
// são internos, e o front só conhece a chave Pix.
function paraResposta(t) {
  return {
    id: t.id,
    chave_destino: t.chave_destino,
    valor: t.valor,
    status: t.status,
    motivo_falha: t.motivo_falha,
    criada_em: t.criada_em,
    atualizada_em: t.atualizada_em,
  }
}

// ─── POST /transferencias: o Pix ─────────────────────────────
//
// Etapa 3: o cabeçalho Idempotency-Key é obrigatório. O cliente gera uma chave
// por Pix e, se precisar repetir aquele Pix, manda a MESMA chave. A repetição
// devolve a transferência original e nunca mexe no dinheiro de novo.
// (As novas tentativas e a rotina de pendentes vêm em outro PR.)
rotasTransferencias.post('/transferencias', async (req, res) => {
  const chaveIdempotencia = lerChaveIdempotencia(req)
  const pedido = validar(esquemaPix, req.body)

  // 0. Repetição? Vem antes de qualquer chamada a Contas: repetir um Pix que
  //    já terminou responde certo mesmo com Contas fora do ar.
  const anterior = await buscarPorChaveIdempotencia(req.usuarioId, chaveIdempotencia)
  if (anterior) return responderRepeticao(res, anterior, pedido)

  // 1. As duas contas. Se Contas estiver fora do ar, para aqui com 503
  //    e nada é gravado.
  const origem = await buscarContaDoUsuario(req.usuarioId)
  const destino = await buscarContaPorChave(pedido.chave_destino)
  if (destino.id === origem.id) {
    throw new ErroHttp(422, 'não dá para mandar Pix para a própria conta')
  }

  // 2. Grava como pendente ANTES de mexer no dinheiro. Se o serviço cair
  //    depois daqui, fica o registro de que o Pix começou.
  let transferencia
  try {
    transferencia = await criarPendente({
      chaveIdempotencia,
      usuarioOrigem: origem.usuario_id,
      contaOrigem: origem.id,
      usuarioDestino: destino.usuario_id,
      contaDestino: destino.id,
      chaveDestino: pedido.chave_destino,
      valor: pedido.valor,
    })
  } catch (erro) {
    if (erro.code !== DUPLICADO || erro.constraint !== 'transferencia_idempotencia_unica') throw erro
    // Duas requisições com a mesma chave ao mesmo tempo (clique duplo, nova
    // tentativa do cliente): a outra gravou primeiro. Esta não move dinheiro,
    // só responde como repetição.
    const outra = await buscarPorChaveIdempotencia(req.usuarioId, chaveIdempotencia)
    return responderRepeticao(res, outra, pedido)
  }

  // 3. Contas faz o débito e o crédito. Se Contas cair agora, o erro 503
  //    sobe e a transferência fica pendente.
  const resultado = await movimentar({
    transferenciaId: transferencia.id,
    contaOrigem: origem.id,
    contaDestino: destino.id,
    valor: pedido.valor,
  })

  // 4. Grava o resultado. concluir e falhar devolvem null se a transferência
  //    já saiu de pendente (a rotina de pendentes chegou antes). Nesse caso
  //    responde com o que está gravado, em vez de estourar.
  const gravada = resultado.concluida
    ? await concluir(transferencia.id)
    : await falhar(transferencia.id, resultado.motivo)

  responderComStatus(res, gravada ?? await buscarPorId(transferencia.id))
})

// A mesma chave só vale para o MESMO Pix. Outro destino ou outro valor com
// uma chave já usada é erro do cliente: nada é feito.
function responderRepeticao(res, anterior, pedido) {
  if (anterior.chave_destino !== pedido.chave_destino || anterior.valor !== pedido.valor) {
    throw new ErroHttp(422, 'esta Idempotency-Key já foi usada em outro Pix')
  }
  responderComStatus(res, anterior)
}

// Resposta de acordo com o status gravado. A repetição recebe a mesma
// resposta que o pedido original recebeu (ou receberia).
function responderComStatus(res, transferencia) {
  if (transferencia.status === 'concluida') {
    return res.status(201).json(paraResposta(transferencia))
  }
  if (transferencia.status === 'falhou') {
    throw new ErroHttp(422, transferencia.motivo_falha)
  }
  // pendente: começou e ainda não se sabe como terminou (Contas caiu no meio,
  // ou a outra requisição com a mesma chave ainda está rodando).
  res.status(202).json(paraResposta(transferencia))
}

// ─── GET /transferencias/:id ─────────────────────────────────
// Só quem enviou consulta. Mesmo padrão de Contas: 404 se não existe,
// 403 se é de outra pessoa.
rotasTransferencias.get('/transferencias/:id', async (req, res) => {
  const transferencia = await buscarPorId(req.params.id)
  if (!transferencia) throw new ErroHttp(404, 'transferência não encontrada')
  if (transferencia.usuario_origem !== req.usuarioId) {
    throw new ErroHttp(403, 'esta transferência não é sua')
  }
  res.json(paraResposta(transferencia))
})
