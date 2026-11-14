import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { chamar } from '../api'
import { reais, paraCentavos } from '../formatar'

export default function EnviarPix() {
  const navegar = useNavigate()
  const [saldo, setSaldo] = useState(null)
  const [chave, setChave] = useState('')
  const [valor, setValor] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [comprovante, setComprovante] = useState(null)

  function sair() {
    localStorage.removeItem('token')
    navegar('/login')
  }

  useEffect(() => {
    async function carregar() {
      try {
        const conta = await chamar('/contas/minha')
        const s = await chamar(`/contas/${conta.id}/saldo`)
        setSaldo(s.saldo)
      } catch (err) {
        if (err.status === 401) sair()
        else setErro(err.message)
      }
    }
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function enviar(e) {
    e.preventDefault()
    setErro('')
    const centavos = paraCentavos(valor)
    if (!centavos) {
      setErro('Digite um valor entre 0,01 e 1.000.000,00, como 25,00')
      return
    }
    setEnviando(true)
    try {
      const t = await chamar('/transferencias', {
        metodo: 'POST',
        corpo: { chave_destino: chave, valor: centavos },
      })
      setComprovante(t)
    } catch (err) {
      if (err.status === 401) sair()
      else setErro(err.message)
    } finally {
      setEnviando(false)
    }
  }

  if (comprovante) {
    return (
      <div className="pix">
        <h1>Pix enviado</h1>
        <p className="sub">{comprovante.status === 'concluida' ? 'Transferência concluída.' : `Status: ${comprovante.status}`}</p>
        <div className="comprovante">
          <span className="data">Valor</span>
          <strong>{reais(comprovante.valor)}</strong>
          <span className="data">Para a chave</span>
          <strong>{comprovante.chave_destino}</strong>
        </div>
        <Link to="/" className="botao-pix">Voltar ao início</Link>
      </div>
    )
  }

  return (
    <form className="pix" onSubmit={enviar}>
      <Link to="/" className="link">← Voltar</Link>
      <h1>Enviar Pix</h1>
      <input
        placeholder="Para quem? (chave Pix)"
        aria-label="Chave Pix de destino"
        value={chave}
        onChange={(e) => setChave(e.target.value)}
        maxLength={140}
        required
      />
      <input
        inputMode="decimal"
        placeholder="Quanto? (ex.: 25,00)"
        aria-label="Valor"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        required
      />
      <p className="sub">Saldo disponível: {saldo === null ? '...' : reais(saldo)}</p>
      {erro && <p role="alert">{erro}</p>}
      <button type="submit" disabled={enviando}>{enviando ? 'Enviando...' : 'Continuar'}</button>
    </form>
  )
}