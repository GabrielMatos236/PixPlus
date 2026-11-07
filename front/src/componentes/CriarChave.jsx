import { useState } from 'react'
import { chamar } from '../api'

export default function CriarChave({ onCriada, onSair }) {
  const [chave, setChave] = useState('')
  const [erro, setErro] = useState('')

  async function criar(e) {
    e.preventDefault()
    setErro('')
    try {
      const conta = await chamar('/contas', { metodo: 'POST', corpo: { chave_pix: chave } })
      onCriada(conta)
    } catch (err) {
      if (err.status === 401) onSair()
      else setErro(err.message)
    }
  }

  return (
    <form onSubmit={criar}>
      <h1>Crie sua chave Pix</h1>
      <p className="sub">A chave é o apelido da sua conta: quem tiver ela consegue te mandar dinheiro.</p>
      <input
        placeholder="E-mail, CPF, celular ou o que preferir"
        value={chave}
        onChange={(e) => setChave(e.target.value)}
        maxLength={140}
        required
      />
      {erro && <p role="alert">{erro}</p>}
      <button type="submit">Criar conta</button>
    </form>
  )
}