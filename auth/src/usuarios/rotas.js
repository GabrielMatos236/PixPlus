import { Router } from 'express'
import argon2 from 'argon2'
import { esquemaCadastro } from './validacao.js'
import { criarUsuario } from './repositorio.js'
import { ErroHttp } from '../erros.js'

const DUPLICADO = '23505' // código do Postgres para violação de UNIQUE

export const rotasUsuarios = Router()

rotasUsuarios.post('/auth/cadastro', async (req, res) => {
  const validacao = esquemaCadastro.safeParse(req.body ?? {})
  if (!validacao.success) {
    const detalhes = validacao.error.issues.map((problema) => ({
      campo: problema.path.join('.'),
      mensagem: problema.message,
    }))
    throw new ErroHttp(400, 'dados inválidos', detalhes)
  }

  const { nome, email, cpf, senha } = validacao.data
  const senhaHash = await argon2.hash(senha) // argon2id; a senha original nunca é guardada

  try {
    const usuario = await criarUsuario({ nome, email, cpf, senhaHash })
    res.status(201).json(usuario)
  } catch (erro) {
    if (erro.code === DUPLICADO) throw new ErroHttp(409, 'e-mail ou cpf já cadastrado')
    throw erro
  }
})
