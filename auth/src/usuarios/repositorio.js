import { pool } from '../db.js'

// Toda conversa com a tabela usuario fica aqui. As rotas não escrevem SQL.

export async function criarUsuario({ nome, email, cpf, senhaHash }) {
  const { rows } = await pool.query(
    `INSERT INTO usuario (nome, email, cpf, senha_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id, nome, email, criado_em`,
    [nome, email, cpf, senhaHash]
  )
  return rows[0]
}
