import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './paginas/Login'
import Cadastro from './paginas/Cadastro'
import Inicio from './paginas/Inicio'
import EnviarPix from './paginas/EnviarPix'

// Só deixa entrar quem tem token guardado; senão manda pro login.
function RotaPrivada({ children }) {
  return localStorage.getItem('token') ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/cadastro" element={<Cadastro />} />
      <Route path="/" element={<RotaPrivada><Inicio /></RotaPrivada>} />
      <Route path="/pix" element={<RotaPrivada><EnviarPix /></RotaPrivada>} />
    </Routes>
  )
}