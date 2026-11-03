import { Router } from 'express'
import { config } from '../config.js'
import { criarValidarToken } from '../autenticacao/validarToken.js'
import { ErroHttp } from '../erros.js'
import {
  esquemaCriarConta,
  esquemaDeposito,
  esquemaPaginacao,
  validar,
} from './validacao.js'
import {
  criarConta,
  buscarContaPorId,
  buscarContaPorChave,
  criarLancamento,
  calcularSaldo,
  listarExtrato,
  verificacao,
} from './repositorio.js'

export const rotasContas = Router()
const validarToken = criarValidarToken(config.JWT_SECRET)
const DUPLICADO = '23505'

// ─── Rotas internas (sem JWT) ───────────────────────────

rotasContas.get('/interno/contas', async (req, res) => {
  const chave = req.query.chave
  if (!chave) throw new ErroHttp(400, 'parâmetro chave é obrigatório')

  const conta = await buscarContaPorChave(chave)
  if (!conta) throw new ErroHttp(404, 'chave pix não encontrada')

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
    if (erro.code === DUPLICADO) throw new ErroHttp(409, 'chave pix já cadastrada')
    throw erro
  }
})

rotasContas.get('/contas/:id', async (req, res) => {
  const conta = await buscarContaPorId(req.params.id)
  if (!conta) throw new ErroHttp(404, 'conta não encontrada')
  if (conta.usuario_id !== req.usuarioId) {
    throw new ErroHttp(403, 'esta conta não é sua')
  }
  res.json(conta)
})

rotasContas.post('/contas/:id/depositos', async (req, res) => {
  const { valor } = validar(esquemaDeposito, req.body)

  const conta = await buscarContaPorId(req.params.id)
  if (!conta) throw new ErroHttp(404, 'conta não encontrada')
  if (conta.usuario_id !== req.usuarioId) {
    throw new ErroHttp(403, 'esta conta não é sua')
  }

  const lancamento = await criarLancamento(conta.id, 'credito', valor)
  res.status(201).json(lancamento)
})

rotasContas.get('/contas/:id/saldo', async (req, res) => {
  const conta = await buscarContaPorId(req.params.id)
  if (!conta) throw new ErroHttp(404, 'conta não encontrada')
  if (conta.usuario_id !== req.usuarioId) {
    throw new ErroHttp(403, 'esta conta não é sua')
  }

  const saldo = await calcularSaldo(conta.id)
  res.json({ conta_id: conta.id, saldo })
})

rotasContas.get('/contas/:id/extrato', async (req, res) => {
  const conta = await buscarContaPorId(req.params.id)
  if (!conta) throw new ErroHttp(404, 'conta não encontrada')
  if (conta.usuario_id !== req.usuarioId) {
    throw new ErroHttp(403, 'esta conta não é sua')
  }

  const { pagina, limite } = validar(esquemaPaginacao, req.query)
  const extrato = await listarExtrato(conta.id, pagina, limite)
  res.json(extrato)
})