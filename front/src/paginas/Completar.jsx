import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { entrarNoZync, mensagemFirebase } from '../entrada'

export default function Completar() {
  const usuario = auth.currentUser
  const [nome, setNome] = useState(usuario?.displayName ?? '')
  const [cpf, setCpf] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const navegar = useNavigate()

  if (!usuario) return <Navigate to="/login" replace />

  async function enviar(e) {
    e.preventDefault()
    setErro('')
    setOcupado(true)
    try {
      await entrarNoZync(usuario, { nome, cpf })
      navegar('/')
    } catch (err) {
      setErro(mensagemFirebase(err))
    } finally {
      setOcupado(false)
    }
  }

  async function cancelar() {
    await signOut(auth)
    navegar('/login')
  }

  return (
    <form onSubmit={enviar}>
      <div className="marca"><span>Z</span>ync</div>
      <h1>Complete seu cadastro</h1>
      <p className="sub">Falta só o que o Google não informa.</p>
      <input placeholder="Nome completo" value={nome} onChange={(e) => setNome(e.target.value)} required />
      <input placeholder="CPF" value={cpf} onChange={(e) => setCpf(e.target.value)} required />
      {erro && <p role="alert">{erro}</p>}
      <button type="submit" disabled={ocupado}>{ocupado ? 'Enviando...' : 'Concluir'}</button>
      <button type="button" className="link" onClick={cancelar}>Cancelar</button>
    </form>
  )
}