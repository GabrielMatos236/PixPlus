import { Router } from 'express'
import argon2 from 'argon2'
import jwt from 'jsonwebtoken'
import { esquemaCadastro, esquemaLogin } from './validacao.js'
import { criarUsuario, buscarPorEmail, buscarPorId } from './repositorio.js'
import { criarValidarToken } from '../autenticacao/validarToken.js'
import { ErroHttp } from '../erros.js'
import { config } from '../config.js'

const DUPLICADO = '23505' // código do Postgres para violação de UNIQUE

// Hash de uma senha qualquer, usado quando o e-mail não existe.
// Assim o login demora o mesmo tempo nos dois casos e não denuncia quais e-mails têm conta.
const HASH_FALSO = await argon2.hash('senha-que-ninguem-usa')

const validarToken = criarValidarToken(config.JWT_SECRET)

export const rotasUsuarios = Router()

function validar(esquema, corpo) {
  const validacao = esquema.safeParse(corpo ?? {})
  if (!validacao.success) {
    const detalhes = validacao.error.issues.map((problema) => ({
      campo: problema.path.join('.'),
      mensagem: problema.message,
    }))
    throw new ErroHttp(400, 'dados inválidos', detalhes)
  }
  return validacao.data
}

rotasUsuarios.post('/auth/cadastro', async (req, res) => {
  const { nome, email, cpf, senha } = validar(esquemaCadastro, req.body)
  const senhaHash = await argon2.hash(senha) // argon2id; a senha original nunca é guardada

  try {
    const usuario = await criarUsuario({ nome, email, cpf, senhaHash })
    res.status(201).json(usuario)
  } catch (erro) {
    if (erro.code === DUPLICADO) throw new ErroHttp(409, 'e-mail ou cpf já cadastrado')
    throw erro
  }
})

rotasUsuarios.post('/auth/login', async (req, res) => {
  const { email, senha } = validar(esquemaLogin, req.body)

  const usuario = await buscarPorEmail(email)
  const senhaConfere = await argon2.verify(usuario?.senha_hash ?? HASH_FALSO, senha)

  if (!usuario || !senhaConfere) {
    throw new ErroHttp(401, 'e-mail ou senha incorretos') // mesma resposta nos dois casos
  }

  const token = jwt.sign({ sub: usuario.id }, config.JWT_SECRET, { expiresIn: '1h' })
  res.json({ token })
})

rotasUsuarios.get('/auth/eu', validarToken, async (req, res) => {
  const usuario = await buscarPorId(req.usuarioId) // o id vem do token, não da URL
  if (!usuario) throw new ErroHttp(404, 'usuário não encontrado')
  res.json(usuario)
})
