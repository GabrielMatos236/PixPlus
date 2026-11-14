import jwt from 'jsonwebtoken'
import { config } from '../config.js'

// O nosso JWT. É o mesmo para quem entra com senha (/auth/login) e para quem entra
// pelo Firebase (/auth/firebase): os outros serviços não sabem nem precisam saber
// por onde a pessoa entrou. Leva só o id do usuário e vale 1 hora.
export function emitirToken(usuarioId) {
  return jwt.sign({ sub: usuarioId }, config.JWT_SECRET, { expiresIn: '1h' })
}
