// Erro "esperado": algo que o cliente fez errado ou uma regra de negócio.
// Carrega o status HTTP que deve ser devolvido.
export class ErroHttp extends Error {
  constructor(status, mensagem, detalhes) {
    super(mensagem)
    this.status = status
    this.detalhes = detalhes
  }
}

// Middleware de erros do Express: tudo que for lançado nas rotas termina aqui.
// Erro esperado vira a resposta certa; erro inesperado vira 500 sem vazar detalhes.
export function tratarErros(erro, req, res, next) {
  if (erro instanceof ErroHttp) {
    const corpo = { erro: erro.message }
    if (erro.detalhes) corpo.detalhes = erro.detalhes
    return res.status(erro.status).json(corpo)
  }

  // JSON malformado no corpo da requisição
  if (erro.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'corpo da requisição não é um JSON válido' })
  }

  console.error('[auth] erro inesperado:', erro)
  res.status(500).json({ erro: 'erro interno' })
}
