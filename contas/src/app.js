import express from 'express'
import cors from 'cors'
import { config } from './config.js'
import { pool } from './db.js'
import { tratarErros } from './erros.js'
import { rotasContas } from './contas/rotas.js'

export function criarApp() {
  const app = express()
  app.disable('x-powered-by')
  app.use(cors({
    origin: config.CORS_ORIGINS,
    optionsSuccessStatus: 200,
  }))
  app.use(express.json({ limit: '10kb' }))

  app.get('/contas/saude', async (req, res) => {
    await pool.query('SELECT 1')
    res.json({ servico: 'contas', banco: true })
  })

  app.use(rotasContas)

  app.use((req, res) => res.status(404).json({ erro: 'rota não encontrada' }))
  app.use(tratarErros)
  return app
}