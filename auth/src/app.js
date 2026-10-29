import express from 'express'
import cors from 'cors'
import { config } from './config.js'
import { pool } from './db.js'
import { rotasUsuarios } from './usuarios/rotas.js'
import { tratarErros } from './erros.js'

// Monta o app sem abrir porta. Assim os testes usam o mesmo app sem subir servidor.
export function criarApp() {
  const app = express()
  app.disable('x-powered-by') // não anuncia que é Express
  app.use(cors({
    origin: config.CORS_ORIGINS, // só as origens da lista
    optionsSuccessStatus: 200,
  }))
  app.use(express.json({ limit: '10kb' }))

  app.get('/auth/saude', async (req, res) => {
    await pool.query('SELECT 1')
    res.json({ servico: 'auth', banco: true })
  })

  app.use(rotasUsuarios)

  app.use((req, res) => res.status(404).json({ erro: 'rota não encontrada' }))
  app.use(tratarErros) // sempre o último
  return app
}
