import jwt from 'jsonwebtoken'

export function criarValidarToken(segredo) {
  if (!segredo) throw new Error('criarValidarToken precisa do JWT_SECRET')

  return function validarToken(req, res, next) {
    const [tipo, token] = (req.get('Authorization') ?? '').split(' ')

    if (tipo !== 'Bearer' || !token) {
      return res.status(401).json({ erro: 'token ausente' })
    }

    try {
      const conteudo = jwt.verify(token, segredo, { algorithms: ['HS256'] })
      req.usuarioId = conteudo.sub
      next()
    } catch (erro) {
      const mensagem = erro.name === 'TokenExpiredError'
        ? 'token expirado'
        : 'token inválido'
      return res.status(401).json({ erro: mensagem })
    }
  }
}