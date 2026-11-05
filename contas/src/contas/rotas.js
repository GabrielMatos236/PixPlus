import { Router } from 'express'
import { config } from '../config.js'
import { criarValidarToken } from '../autenticacao/validarToken.js'
import { ErroHttp } from '../erros.js'
import {
  esquemaCriarConta,
  esquemaDeposito,
  esquemaPaginacao,
  esquemaBuscaInterna,
  validar,
} from './validacao.js'
import {
  criarConta,
  buscarContaPorId,
  buscarContaPorUsuario,
  buscarContaInterna,
  criarLancamento,
  calcularSaldo,
  listarExtrato,
  verificacao,
} from './repositorio.js'

export const rotasContas = Router()
const validarToken = criarValidarToken(config.JWT_SECRET)
const DUPLICADO = '23505'

// Conta pelo id da URL, garantindo que é de quem está logado.
async function contaDoUsuario(req) {
  const conta = await buscarContaPorId(req.params.id)
  if (!conta) throw new ErroHttp(404, 'conta não encontrada')
  if (conta.usuario_id !== req.usuarioId) throw new ErroHttp(403, 'esta conta não é sua')
  return conta
}

// ─── Rotas internas (sem JWT; o nginx bloqueia /interno) ─

// ?chave=...      → conta de destino de um Pix
// ?usuario_id=... → conta de origem (a do usuário logado em Transferências)
rotasContas.get('/interno/contas', async (req, res) => {
  const { chave, usuario_id } = validar(esquemaBuscaInterna, req.query)

  const conta = await buscarContaInterna({ chave, usuarioId: usuario_id })
  if (!conta) {
    throw new ErroHttp(404, chave !== undefined ? 'chave pix não encontrada' : 'usuário sem conta')
  }
  res.json(conta)
})

rotasContas.get('/interno/verificacao', async (req, res) => {
  const resultado = await verificacao()
  res.json(resultado)
})

// ─── Barreira do JWT ────────────────────────────────────
rotasContas.use('/contas', validarToken)

// ─── Rotas protegidas (com JWT) ─────────────────────────

rotasContas.post('/contas', async (req, res) => {
  const { chave_pix } = validar(esquemaCriarConta, req.body)

  try {
    const conta = await criarConta(req.usuarioId, chave_pix)
    res.status(201).json(conta)
  } catch (erro) {
    if (erro.code === DUPLICADO && erro.constraint === 'conta_usuario_unico') {
      throw new ErroHttp(409, 'você já tem uma conta')
    }
    if (erro.code === DUPLICADO) throw new ErroHttp(409, 'chave pix já cadastrada')
    throw erro
  }
})

// Antes de /contas/:id: senão o Express entende "minha" como um id.
rotasContas.get('/contas/minha', async (req, res) => {
  const conta = await buscarContaPorUsuario(req.usuarioId)
  if (!conta) throw new ErroHttp(404, 'você ainda não tem conta')
  res.json(conta)
})

rotasContas.get('/contas/:id', async (req, res) => {
  res.json(await contaDoUsuario(req))
})

rotasContas.post('/contas/:id/depositos', async (req, res) => {
  const { valor } = validar(esquemaDeposito, req.body)
  const conta = await contaDoUsuario(req)

  const lancamento = await criarLancamento(conta.id, 'credito', valor)
  res.status(201).json(lancamento)
})

rotasContas.get('/contas/:id/saldo', async (req, res) => {
  const conta = await contaDoUsuario(req)

  const saldo = await calcularSaldo(conta.id)
  res.json({ conta_id: conta.id, saldo })
})

rotasContas.get('/contas/:id/extrato', async (req, res) => {
  const conta = await contaDoUsuario(req)

  const { pagina, limite } = validar(esquemaPaginacao, req.query)
  const extrato = await listarExtrato(conta.id, pagina, limite)
  res.json(extrato)
})
