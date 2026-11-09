import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { config } from '../config.js'
import { criarValidarToken } from '../autenticacao/validarToken.js'
import { ErroHttp } from '../erros.js'
import { esquemaPix, validar } from './validacao.js'
import { criarPendente, concluir, falhar, buscarPorId } from './repositorio.js'
import { buscarContaDoUsuario, buscarContaPorChave, movimentar } from '../contas/clienteContas.js'

export const rotasTransferencias = Router()
const validarToken = criarValidarToken(config.JWT_SECRET)

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
// VERSÃO INGÊNUA (etapa 2). Na etapa 3 entram o cabeçalho Idempotency-Key
// obrigatório, o timeout com 3 tentativas e a rotina de pendentes.
rotasTransferencias.post('/transferencias', async (req, res) => {
  const { chave_destino, valor } = validar(esquemaPix, req.body)

  // 1. As duas contas. Se Contas estiver fora do ar, para aqui com 503
  //    e nada é gravado.
  const origem = await buscarContaDoUsuario(req.usuarioId)
  const destino = await buscarContaPorChave(chave_destino)
  if (destino.id === origem.id) {
    throw new ErroHttp(422, 'não dá para mandar Pix para a própria conta')
  }

  // 2. Grava como pendente ANTES de mexer no dinheiro. Se o serviço cair
  //    depois daqui, fica o registro de que o Pix começou.
  //    Etapa 2: a chave de idempotência é gerada aqui, uma por requisição.
  const transferencia = await criarPendente({
    chaveIdempotencia: randomUUID(),
    usuarioOrigem: origem.usuario_id,
    contaOrigem: origem.id,
    usuarioDestino: destino.usuario_id,
    contaDestino: destino.id,
    chaveDestino: chave_destino,
    valor,
  })

  // 3. Contas faz o débito e o crédito. Se Contas cair agora, o erro 503
  //    sobe e a transferência fica pendente.
  const resultado = await movimentar({
    transferenciaId: transferencia.id,
    contaOrigem: origem.id,
    contaDestino: destino.id,
    valor,
  })

  // 4. Grava o resultado.
  if (!resultado.concluida) {
    await falhar(transferencia.id, resultado.motivo)
    throw new ErroHttp(422, resultado.motivo)
  }

  const concluida = await concluir(transferencia.id)
  res.status(201).json(paraResposta(concluida))
})

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
