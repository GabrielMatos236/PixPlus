import { useState } from 'react'
import { Link } from 'react-router-dom'
import { createUserWithEmailAndPassword, sendEmailVerification, signOut, deleteUser } from 'firebase/auth'
import { auth } from '../firebase'
import { entrarNoZync, mensagemFirebase } from '../entrada'

function cpfValido(cpf) {
  const n = cpf.replace(/\D/g, '')
  if (n.length !== 11 || /^(\d)\1+$/.test(n)) return false
  for (const t of [9, 10]) {
    let soma = 0
    for (let i = 0; i < t; i++) soma += Number(n[i]) * (t + 1 - i)
    if (((soma * 10) % 11) % 10 !== Number(n[t])) return false
  }
  return true
}

export default function Cadastro() {
  const [form, setForm] = useState({ nome: '', email: '', cpf: '', senha: '' })
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const mudar = (campo) => (e) => setForm({ ...form, [campo]: e.target.value })

  async function cadastrar(e) {
    e.preventDefault()
    setErro('')
    setAviso('')
    if (!cpfValido(form.cpf)) {
      setErro('CPF inválido')
      return
    }
    setOcupado(true)
    let credencial
    try {
      credencial = await createUserWithEmailAndPassword(auth, form.email, form.senha)
      await entrarNoZync(credencial.user, { nome: form.nome, cpf: form.cpf })
      await sendEmailVerification(credencial.user)
      localStorage.removeItem('token')
      await signOut(auth)
      setAviso('Enviamos um link para o seu e-mail. Confirme e depois faça login.')
    } catch (err) {
      // erro do nosso backend (não tem err.code): desfaz a conta do Firebase pra poder tentar de novo
      if (credencial && !err.code) await deleteUser(credencial.user).catch(() => {})
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
      {aviso && <p role="status">{aviso}</p>}
      <button type="submit" disabled={ocupado}>{ocupado ? 'Criando...' : 'Criar conta'}</button>
      <p className="sub">Já tem conta? <Link to="/login">Entrar</Link></p>
    </form>
  )
}