import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth'
import { auth } from '../firebase'
import { entrarNoZync, mensagemFirebase } from '../entrada'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const navegar = useNavigate()

  async function concluir(credencial) {
    try {
      await entrarNoZync(credencial.user)
      navegar('/')
    } catch (err) {
      // 422 com "detalhes" = primeiro acesso, falta nome e/ou CPF
      if (err.status === 422 && err.dados?.detalhes) navegar('/completar')
      else throw err
    }
  }

  async function comEmail(e) {
    e.preventDefault()
    setErro('')
    setOcupado(true)
    try {
      await concluir(await signInWithEmailAndPassword(auth, email, senha))
    } catch (err) {
      setErro(mensagemFirebase(err))
    } finally {
      setOcupado(false)
    }
  }

  async function comGoogle() {
    setErro('')
    setOcupado(true)
    try {
      await concluir(await signInWithPopup(auth, new GoogleAuthProvider()))
    } catch (err) {
      setErro(mensagemFirebase(err))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <form onSubmit={comEmail}>
      <img className="logo" src="/zync-icone-app.svg" width="76" height="76" alt="Logo Zync" />
      <div className="marca"><span>Z</span>ync</div>
      <p className="sub">Seu dinheiro, na hora.</p>
      <input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input type="password" placeholder="Senha" value={senha} onChange={(e) => setSenha(e.target.value)} required />
      {erro && <p role="alert">{erro}</p>}
      <button type="submit" disabled={ocupado}>Entrar</button>
      <button type="button" className="botao-google" onClick={comGoogle} disabled={ocupado}>Entrar com Google</button>
      <p className="sub">Ainda não tem conta? <Link to="/cadastro">Criar conta</Link></p>
    </form>
  )
}