import './verificarBanco.js'
import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'

const { criarApp } = await import('../src/app.js')
const { pool } = await import('../src/db.js')
const { config } = await import('../src/config.js')

export { pool }
export const app = criarApp()

export function novoUsuario() {
  const id = randomUUID()

  const token = jwt.sign(
    { sub: id },
    config.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  )

  return {
    id,
    autorizacao: `Bearer ${token}`,
  }
}

export async function limparBanco() {
  await pool.query('TRUNCATE notificacao, evento_recebido')
}