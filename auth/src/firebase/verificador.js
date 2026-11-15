import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { ErroHttp } from '../erros.js'

// Confere o token que o front recebe do Firebase depois do login (Google ou e-mail e senha).
//
// O firebase-admin confere a assinatura com as chaves públicas do Google, a validade,
// e se o token é deste projeto. Para isso só precisa do id do projeto: nenhuma
// chave secreta fica no nosso servidor.
//
// Devolve só o que o Auth usa: { uid, email, nome }.
// Nos testes, este verificador é trocado por um falso (criarApp({ verificarTokenFirebase })).

// O firebase-admin devolve o mesmo código (auth/argument-error) para token ruim e para
// "não consegui buscar as chaves do Google". Só a mensagem diferencia os dois casos.
// Sem isso, o Google fora do ar viraria "token inválido" e o usuário acharia que errou.
const FALHA_NA_REDE = /^Error (while making request|fetching public keys)/

export function criarVerificadorFirebase(projectId) {
  if (!projectId) {
    return async function firebaseNaoConfigurado() {
      throw new ErroHttp(503, 'login pelo firebase não configurado no servidor')
    }
  }

  // Um app do firebase-admin por projeto, reaproveitado se o criarApp rodar de novo.
  const nomeApp = `pixplus-${projectId}`
  const app = getApps().find((a) => a.name === nomeApp) ?? initializeApp({ projectId }, nomeApp)
  const auth = getAuth(app)

  return async function verificarTokenFirebase(idToken) {
    let token
    try {
      token = await auth.verifyIdToken(idToken)
    } catch (erro) {
      if (FALHA_NA_REDE.test(erro.message ?? '')) {
        console.error('[auth] não consegui buscar as chaves do Google:', erro.message)
        throw new ErroHttp(503, 'firebase indisponível, tente de novo')
      }
      if (erro.code?.startsWith('auth/')) {
        throw new ErroHttp(401, 'token do firebase inválido ou expirado')
      }
      throw erro
    }

    return {
      uid: token.uid,
      email: token.email?.trim().toLowerCase(), // a tabela só aceita e-mail em minúsculas
      nome: token.name, // vem no login com Google; no e-mail e senha costuma não vir
    }
  }
}
