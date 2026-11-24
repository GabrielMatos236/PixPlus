import { chamar } from './api'

// troca o token do Firebase pelo nosso JWT (POST /auth/firebase) e guarda
export async function entrarNoZync(usuarioFirebase, extras = {}) {
  const idToken = await usuarioFirebase.getIdToken()
  const dados = await chamar('/auth/firebase', { metodo: 'POST', corpo: { idToken, ...extras } })
  localStorage.setItem('token', dados.token)
}

// erros do Firebase têm "code"; os do nosso backend não, e caem no err.message
export function mensagemFirebase(err) {
  const mensagens = {
    'auth/invalid-credential': 'E-mail ou senha incorretos',
    'auth/email-already-in-use': 'Esse e-mail já tem cadastro no Firebase. Entre em vez de criar conta.',
    'auth/weak-password': 'Senha fraca: use pelo menos 8 caracteres',
    'auth/invalid-email': 'E-mail inválido',
    'auth/popup-closed-by-user': 'A janela do Google foi fechada antes de entrar',
    'auth/too-many-requests': 'Muitas tentativas. Espere um pouco e tente de novo',
    'auth/network-request-failed': 'Sem conexão com o Firebase',
    'auth/operation-not-allowed': 'Esse tipo de login não está ligado no Firebase',
    'auth/unauthorized-domain': 'Este endereço não está liberado no Firebase',
    'auth/invalid-api-key': 'Firebase sem configuração: falta o front/.env.local',
  }
  return mensagens[err.code] ?? err.message
}