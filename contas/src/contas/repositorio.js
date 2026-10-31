import { pool } from '../db.js'

export async function criarConta(usuarioId, chavePix) {
  const { rows } = await pool.query(
    `INSERT INTO conta (usuario_id, chave_pix)
     VALUES ($1, $2)
     RETURNING id, usuario_id, chave_pix, criada_em`,
    [usuarioId, chavePix],
  )
  return rows[0]
}