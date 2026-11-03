import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { chamar } from '../api'

export default function Cadastro() {
  const [form, setForm] = useState({ nome: '', email: '', cpf: '', senha: '' })
  const [erro, setErro] = useState('')
  const navegar = useNavigate()

  const mudar = (campo) => (e) => setForm({ ...form, [campo]: e.target.value })

  async function cadastrar(e) {
    e.preventDefault()
    setErro('')
    try {
      await chamar('/auth/cadastro', { metodo: 'POST', corpo: form })
      navegar('/login')
    } catch (err) {
      setErro(err.status === 409 ? 'E-mail ou CPF já cadastrado' : err.message)
    }
  }

  return (
    <form onSubmit={cadastrar}>
      <h1>Cadastro</h1>
      <input placeholder="Nome" value={form.nome} onChange={mudar('nome')} required />
      <input type="email" placeholder="E-mail" value={form.email} onChange={mudar('email')} required />
      <input placeholder="CPF" value={form.cpf} onChange={mudar('cpf')} required />
      <input type="password" placeholder="Senha (8 a 128 caracteres)" value={form.senha} onChange={mudar('senha')} required />
      {erro && <p role="alert">{erro}</p>}
      <button type="submit">Criar conta</button>
      <p>Já tem conta? <Link to="/login">Entrar</Link></p>
    </form>
  )
}