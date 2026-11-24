import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { chamar, gerarUuid } from '../api'
import { reais, paraCentavos } from '../formatar'

export default function EnviarPix() {
  const navegar = useNavigate()
  const [saldo, setSaldo] = useState(null)
  const [chave, setChave] = useState('')
  const [valor, setValor] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [comprovante, setComprovante] = useState(null)
  // Idempotency-Key do Pix que está sendo tentado: { chave, destino, centavos }.
  // Se a pessoa tentar de novo o MESMO Pix depois de um erro de rede ou 503,
  // vai a mesma chave, e o back não cobra duas vezes. Mudou o destino ou o
  // valor, é outro Pix: chave nova.
  const tentativa = useRef(null)

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
    // Mesma normalização do back: sem espaços nas pontas e em minúsculas.
    const destino = chave.trim().toLowerCase()
    const mesmoPix = tentativa.current?.destino === destino && tentativa.current?.centavos === centavos
    if (!mesmoPix) tentativa.current = { chave: gerarUuid(), destino, centavos }

    setEnviando(true)
    try {
      const t = await chamar('/transferencias', {
        metodo: 'POST',
        corpo: { chave_destino: chave, valor: centavos },
        cabecalhos: { 'Idempotency-Key': tentativa.current.chave },
      })
      tentativa.current = null // 201 (concluído) ou 202 (em processamento): esse Pix acabou aqui
      setComprovante(t)
    } catch (err) {
      if (err.status === 401) return sair()
      // Sem resposta (rede caiu) ou 5xx: não dá pra saber se o Pix passou.
      // Guarda a chave: tentando de novo, o back devolve o resultado do original.
      const resultadoIncerto = !err.status || err.status >= 500
      if (resultadoIncerto) {
        setErro('Não deu para confirmar o Pix. Tente de novo: se ele já tiver passado, você não será cobrado duas vezes.')
      } else {
        // 400, 404, 422: resposta definitiva. A próxima tentativa é um Pix novo.
        tentativa.current = null
        setErro(err.message)
      }
    } finally {
      setEnviando(false)
    }
  }

  if (comprovante) {
    return (
      <div className="pix">
        <h1>{comprovante.status === 'pendente' ? 'Pix em processamento' : 'Pix enviado'}</h1>
        <p className="sub">
          {comprovante.status === 'pendente'
            ? 'Ele ainda está sendo processado. Confira o extrato em instantes.'
            : 'Transferência concluída.'}
        </p>
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