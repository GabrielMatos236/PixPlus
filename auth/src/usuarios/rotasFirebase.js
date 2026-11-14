import { Router } from 'express'
import { campoNome, esquemaFirebase, validar } from './validacao.js'
import { buscarPorEmail, buscarPorFirebaseUid, criarUsuarioFirebase } from './repositorio.js'
import { emitirToken } from '../autenticacao/emitirToken.js'
import { ErroHttp } from '../erros.js'

const DUPLICADO = '23505' // código do Postgres para violação de UNIQUE

// POST /auth/firebase: troca o token do Firebase pelo nosso JWT.
//
//   front ──login no Firebase──► idToken ──POST /auth/firebase──► { token } (o nosso JWT)
//
// O verificador vem de fora (criarApp) para os testes usarem um falso,
// sem precisar de internet nem de um projeto no Firebase.
export function criarRotasFirebase(verificarTokenFirebase) {
  const rotas = Router()

  rotas.post('/auth/firebase', async (req, res) => {
    const corpo = validar(esquemaFirebase, req.body)
    const firebase = await verificarTokenFirebase(corpo.idToken) // 401 ou 503 se der errado

    // 1. Já entrou antes: só devolve o nosso token. Nome e CPF do corpo são ignorados.
    const existente = await buscarPorFirebaseUid(firebase.uid)
    if (existente) return res.json({ token: emitirToken(existente.id) })

    // 2. Primeiro acesso. Os "não" que não dependem do que a pessoa digitar vêm antes,
    //    para ela não preencher nome e CPF e só depois descobrir que não ia dar.
    if (!firebase.email) throw new ErroHttp(422, 'a conta do firebase precisa ter e-mail')
    if (await buscarPorEmail(firebase.email)) throw new ErroHttp(409, 'e-mail já cadastrado')

    // No login com Google o nome vem no token. Se não vier, ou vier fora da regra, pede.
    const nome = corpo.nome ?? nomeValidoOuNada(firebase.nome)
    const faltando = []
    if (!nome) faltando.push({ campo: 'nome', mensagem: 'informe o nome' })
    if (!corpo.cpf) faltando.push({ campo: 'cpf', mensagem: 'informe o cpf' })
    if (faltando.length > 0) throw new ErroHttp(422, 'complete o cadastro', faltando)

    try {
      const usuario = await criarUsuarioFirebase({
        nome,
        email: firebase.email,
        cpf: corpo.cpf,
        firebaseUid: firebase.uid,
      })
      res.status(201).json({ token: emitirToken(usuario.id) })
    } catch (erro) {
      if (erro.code !== DUPLICADO) throw erro

      // Dois primeiros acessos da mesma pessoa ao mesmo tempo (clique duplo):
      // o outro pedido acabou de criar o usuário. Entra com ele.
      if (erro.constraint === 'usuario_firebase_uid_key') {
        const usuario = await buscarPorFirebaseUid(firebase.uid)
        return res.json({ token: emitirToken(usuario.id) })
      }
      if (erro.constraint === 'usuario_cpf_key') throw new ErroHttp(409, 'cpf já cadastrado')
      throw new ErroHttp(409, 'e-mail já cadastrado')
    }
  })

  return rotas
}

function nomeValidoOuNada(nome) {
  const resultado = campoNome.safeParse(nome)
  return resultado.success ? resultado.data : undefined
}
