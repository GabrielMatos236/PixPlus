import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth } from '../firebase'
import { entrarNoZync, mensagemFirebase } from '../entrada'
import { signInWithEmailAndPassword, signOut } from 'firebase/auth'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const navegar = useNavigate()

  async function entrar(e) {
    e.preventDefault()
    setErro('')
    setOcupado(true)
    try {
            const credencial = await signInWithEmailAndPassword(auth, email, senha)
      if (!credencial.user.emailVerified) {
        await signOut(auth)
        setErro('Confirme seu e-mail antes de entrar. Enviamos um link quando você criou a conta.')
        return
      }
      try {
        await entrarNoZync(credencial.user)
        navegar('/')
      } catch (err) {
        setErro(mensagemFirebase(err))
      }
    } finally {
      setOcupado(false)
    }
  }

  return (
    <form onSubmit={entrar}>
      <img className="logo" src="/zync-icone-app.svg" width="76" height="76" alt="Logo Zync" />
      <div className="marca"><span>Z</span>ync</div>
      <p className="sub">Seu dinheiro, na hora.</p>
      <input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input type="password" placeholder="Senha" value={senha} onChange={(e) => setSenha(e.target.value)} required />
      {erro && <p role="alert">{erro}</p>}
      <button type="submit" disabled={ocupado}>{ocupado ? 'Entrando...' : 'Entrar'}</button>
      <p className="sub">Ainda não tem conta? <Link to="/cadastro">Criar conta</Link></p>
    </form>
  )
}