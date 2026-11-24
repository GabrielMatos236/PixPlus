import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../firebase'
import { entrarNoZync, mensagemFirebase } from '../entrada'

export default function Cadastro() {
  const [form, setForm] = useState({ nome: '', email: '', cpf: '', senha: '' })
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const navegar = useNavigate()

  const mudar = (campo) => (e) => setForm({ ...form, [campo]: e.target.value })

  async function cadastrar(e) {
    e.preventDefault()
    setErro('')
    setOcupado(true)
    try {
      const credencial = await createUserWithEmailAndPassword(auth, form.email, form.senha)
      await entrarNoZync(credencial.user, { nome: form.nome, cpf: form.cpf })
      navegar('/')
    } catch (err) {
      setErro(mensagemFirebase(err))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <form onSubmit={cadastrar}>
      <div className="marca"><span>Z</span>ync</div>
      <h1>Criar conta</h1>
      <input placeholder="Nome completo" value={form.nome} onChange={mudar('nome')} required />
      <input type="email" placeholder="E-mail" value={form.email} onChange={mudar('email')} required />
      <input placeholder="CPF" value={form.cpf} onChange={mudar('cpf')} required />
      <input type="password" placeholder="Senha (mínimo 8 caracteres)" minLength={8} value={form.senha} onChange={mudar('senha')} required />
      {erro && <p role="alert">{erro}</p>}
      <button type="submit" disabled={ocupado}>{ocupado ? 'Criando...' : 'Criar conta'}</button>
      <p className="sub">Já tem conta? <Link to="/login">Entrar</Link></p>
    </form>
  )
}