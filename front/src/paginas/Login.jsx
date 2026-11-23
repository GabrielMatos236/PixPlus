import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../firebase'
import { entrarNoZync, mensagemFirebase } from '../entrada'

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
      try {
        await entrarNoZync(credencial.user)
        navegar('/')
      } catch (err) {
        // 422 com "detalhes": existe no Firebase mas falta o cadastro no Auth
        // (o cadastro caiu no meio). Vai pra tela de completar.
        if (err.status === 422 && err.dados?.detalhes) navegar('/completar')
        else throw err
      }
    } catch (err) {
      setErro(mensagemFirebase(err))
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