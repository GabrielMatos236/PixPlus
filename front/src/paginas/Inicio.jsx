import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { chamar } from '../api'

export default function Inicio() {
  const [usuario, setUsuario] = useState(null)
  const navegar = useNavigate()

  function sair() {
    localStorage.removeItem('token')
    navegar('/login')
  }

  useEffect(() => {
    chamar('/auth/eu')
      .then(setUsuario)
      .catch(() => {
        localStorage.removeItem('token')
        navegar('/login')
      })
  }, [navegar])

  return (
    <div>
      <h1>Banco Pix</h1>
      <p>Olá, {usuario?.nome}</p>
      <button onClick={sair}>Sair</button>
    </div>
  )
}