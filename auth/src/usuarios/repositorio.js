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

export async function buscarPorEmail(email) {
  const { rows } = await pool.query(
    'SELECT id, senha_hash FROM usuario WHERE email = $1',
    [email]
  )
  return rows[0] // undefined quando o e-mail não existe
}

// Primeiro acesso pelo Firebase: sem senha_hash, ligado pelo uid do Firebase.
export async function criarUsuarioFirebase({ nome, email, cpf, firebaseUid }) {
  const { rows } = await pool.query(
    `INSERT INTO usuario (nome, email, cpf, firebase_uid)
     VALUES ($1, $2, $3, $4)
     RETURNING id, nome, email, criado_em`,
    [nome, email, cpf, firebaseUid]
  )
  return rows[0]
}

export async function buscarPorFirebaseUid(firebaseUid) {
  const { rows } = await pool.query(
    'SELECT id FROM usuario WHERE firebase_uid = $1',
    [firebaseUid]
  )
  return rows[0] // undefined no primeiro acesso
}

export async function buscarPorId(id) {
  const { rows } = await pool.query(
    'SELECT id, nome, email, criado_em FROM usuario WHERE id = $1',
    [id]
  )
  return rows[0] // undefined quando o usuário não existe mais
}
