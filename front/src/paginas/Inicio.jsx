import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { chamar } from '../api'
import { reais, dataHora, paraCentavos } from '../formatar'
import CriarChave from '../componentes/CriarChave'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'

function saudacao() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

// o extrato só traz tipo e transferencia_id; é daí que sai o texto
function descricao(l) {
  if (l.tipo === 'debito') return 'Pix enviado'
  return l.transferencia_id ? 'Pix recebido' : 'Depósito'
}

export default function Inicio() {
  const navegar = useNavigate()
  const [usuario, setUsuario] = useState(null)
  const [conta, setConta] = useState(null)
  const [semConta, setSemConta] = useState(false)
  const [saldo, setSaldo] = useState(0)
  const [lancamentos, setLancamentos] = useState([])
  const [avisos, setAvisos] = useState([])
  const [mostrar, setMostrar] = useState(true)
  const [valor, setValor] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [depositando, setDepositando] = useState(false)

  const sair = useCallback(() => {
    localStorage.removeItem('token')
    signOut(auth)
    navegar('/login')
  }, [navegar])

  const carregarConta = useCallback(async (c) => {
    const [s, e] = await Promise.all([
      chamar(`/contas/${c.id}/saldo`),
      chamar(`/contas/${c.id}/extrato?limite=10`),
    ])
    setSaldo(s.saldo)
    setLancamentos(e.lancamentos)
  }, [])

  // se o serviço de avisos falhar, a tela inicial continua funcionando
  const carregarAvisos = useCallback(async () => {
    try {
      const r = await chamar('/notificacoes?limite=10')
      setAvisos(r.notificacoes)
    } catch (err) {
      if (err.status === 401) sair()
    }
  }, [sair])

  useEffect(() => {
    async function iniciar() {
      try {
        setUsuario(await chamar('/auth/eu'))
        try {
          const c = await chamar('/contas/minha')
          setConta(c)
          await carregarConta(c)
          await carregarAvisos()
        } catch (err) {
          if (err.status === 404) setSemConta(true)
          else throw err
        }
      } catch (err) {
        if (err.status === 401) sair()
        else setErro(err.message)
      } finally {
        setCarregando(false)
      }
    }
    iniciar()
  }, [carregarConta, carregarAvisos, sair])

  // o aviso chega depois do Pix (passa pela outbox e pelo worker), então a tela confere de novo a cada 10 s
  useEffect(() => {
    if (!conta) return
    const timer = setInterval(carregarAvisos, 10000)
    return () => clearInterval(timer)
  }, [conta, carregarAvisos])

  async function depositar(e) {
    e.preventDefault()
    if (depositando) return // clique duplo: o segundo não faz nada
    setErro('')
    const centavos = paraCentavos(valor)
    if (!centavos) {
      setErro('Digite um valor entre 0,01 e 1.000.000,00, como 50,00')
      return
    }
    setDepositando(true)
    try {
      await chamar(`/contas/${conta.id}/depositos`, { metodo: 'POST', corpo: { valor: centavos } })
      setValor('')
      await carregarConta(conta)
    } catch (err) {
      if (err.status === 401) sair()
      else setErro(err.message)
    } finally {
      setDepositando(false)
    }
  }

  async function marcarLido(aviso) {
    if (aviso.lida) return
    try {
      const nova = await chamar(`/notificacoes/${aviso.id}`, { metodo: 'PATCH', corpo: { lida: true } })
      setAvisos((lista) => lista.map((a) => (a.id === nova.id ? nova : a)))
    } catch (err) {
      if (err.status === 401) sair()
      else setErro(err.message)
    }
  }

  if (carregando) return <p className="sub">Carregando...</p>

  if (semConta) {
    return (
      <CriarChave
        onSair={sair}
        onCriada={(c) => {
          setConta(c)
          setSaldo(0)
          setLancamentos([])
          setSemConta(false)
        }}
      />
    )
  }

  const naoLidas = avisos.filter((a) => !a.lida).length

  return (
    <div className="inicio">
      <header className="topo">
        <div>
          <span className="sub-topo">{saudacao()},</span>
          <strong>{usuario?.nome?.split(' ')[0]}</strong>
        </div>
        <button type="button" className="link" onClick={sair}>Sair</button>
      </header>

      <section className="cartao-saldo">
        <div className="linha">
          <span>Saldo disponível</span>
          <button type="button" className="link-escuro" onClick={() => setMostrar(!mostrar)}>
            {mostrar ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>
        <div className="saldo">{mostrar ? reais(saldo) : 'R$ ••••'}</div>
        <span className="chave">Chave Pix: {conta?.chave_pix}</span>
      </section>
      <Link to="/pix" className="botao-pix">Enviar Pix</Link>

      <form className="deposito" onSubmit={depositar}>
        <input
          inputMode="decimal"
          placeholder="Depositar (ex.: 50,00)"
          aria-label="Valor do depósito"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
        />
        <button type="submit" disabled={depositando}>
          {depositando ? 'Processando...' : 'Depositar'}
        </button>
      </form>
      {erro && <p role="alert">{erro}</p>}

      <section className="avisos">
        <h2>
          Avisos {naoLidas > 0 && <span className="contador">{naoLidas}</span>}
        </h2>
        {avisos.length === 0 && <p className="sub">Nenhum aviso por enquanto.</p>}
        <ul>
          {avisos.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className={a.lida ? 'aviso lido' : 'aviso'}
                onClick={() => marcarLido(a)}
              >
                <span className="desc">{a.mensagem}</span>
                <span className="data">{dataHora(a.criada_em)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="movimentacoes">
        <h2>Últimas movimentações</h2>
        {lancamentos.length === 0 && <p className="sub">Nenhuma movimentação ainda.</p>}
        <ul>
          {lancamentos.map((l) => (
            <li key={l.id}>
              <div>
                <span className="desc">{descricao(l)}</span>
                <span className="data">{dataHora(l.criado_em)}</span>
              </div>
              <span className={l.tipo === 'credito' ? 'valor entrada' : 'valor saida'}>
                {l.tipo === 'credito' ? '+ ' : '− '}{reais(l.valor)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}