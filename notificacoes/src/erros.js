export class ErroHttp extends Error {
  constructor(status, mensagem, detalhes) {
    super(mensagem)
    this.status = status
    this.detalhes = detalhes
  }
}

export function tratarErros(erro, req, res, next) {
  if (res.headersSent) {
    return next(erro)
  }

  if (erro instanceof ErroHttp) {
    const corpo = { erro: erro.message }

    if (erro.detalhes) {
      corpo.detalhes = erro.detalhes
    }

    return res.status(erro.status).json(corpo)
  }

  if (erro.type === 'entity.parse.failed') {
    return res.status(400).json({
      erro: 'corpo da requisição não é um JSON válido',
    })
  }

  console.error('[notificacoes] erro inesperado:', erro)

  return res.status(500).json({ erro: 'erro interno' })
}