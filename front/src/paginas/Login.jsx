import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { chamar } from '../api'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const navegar = useNavigate()

  async function entrar(e) {
    e.preventDefault()
    setErro('')
    try {
      const dados = await chamar('/auth/login', { metodo: 'POST', corpo: { email, senha } })
      localStorage.setItem('token', dados.token)
      navegar('/')
    } catch (err) {
      setErro(err.status === 401 ? 'E-mail ou senha incorretos' : err.message)
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
      <button type="submit">Entrar</button>
      <p className="sub">Ainda não tem conta? <Link to="/cadastro">Criar conta</Link></p>
    </form>
  )
}