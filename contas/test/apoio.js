// Coisas que todos os testes do Contas usam.
import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'

const nomeBanco = new URL(process.env.DATABASE_URL ?? 'postgres://x/sem-banco').pathname.slice(1)
if (!nomeBanco.endsWith('_test')) {
  console.error(`[testes] recusei rodar no banco "${nomeBanco}". Use um banco terminado em _test.`)
  process.exit(1)
}

// Importados só depois da trava acima, para nunca conectar no banco de desenvolvimento.
const { criarApp } = await import('../src/app.js')
const { pool } = await import('../src/db.js')
const { config } = await import('../src/config.js')

export { pool }
export const app = criarApp()

// O Contas não fala com o Auth: só confere a assinatura do token.
// Então os testes geram o token direto, como o Auth faria no login.
export function novoUsuario() {
  const id = randomUUID()
  const token = jwt.sign({ sub: id }, config.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' })
  return { id, autorizacao: `Bearer ${token}` }
}

export async function limparBanco() {
  await pool.query('TRUNCATE lancamento, conta')
}
