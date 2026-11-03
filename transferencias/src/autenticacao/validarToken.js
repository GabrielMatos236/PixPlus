import jwt from 'jsonwebtoken'

// Middleware que confere o crachá (JWT) antes da rota.
// Este arquivo não depende de nada do Auth: os outros serviços copiam ele igual,
// instalam a jsonwebtoken e usam o mesmo JWT_SECRET.
//
// Uso:
//   const validarToken = criarValidarToken(process.env.JWT_SECRET)
//   app.get('/contas/:id', validarToken, async (req, res) => { ... req.usuarioId ... })
export function criarValidarToken(segredo) {
  if (!segredo) throw new Error('criarValidarToken precisa do JWT_SECRET')

  return function validarToken(req, res, next) {
    const [tipo, token] = (req.get('Authorization') ?? '').split(' ')

    if (tipo !== 'Bearer' || !token) {
      return res.status(401).json({ erro: 'token ausente' })
    }

    try {
      // algorithms fixo: aceita só HS256, nunca o algoritmo que o token disser que usa
      const conteudo = jwt.verify(token, segredo, { algorithms: ['HS256'] })
      req.usuarioId = conteudo.sub
      next()
    } catch (erro) {
      const mensagem = erro.name === 'TokenExpiredError' ? 'token expirado' : 'token inválido'
      return res.status(401).json({ erro: mensagem })
    }
  }
}