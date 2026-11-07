import express from 'express'
import cors from 'cors'
import { config } from './config.js'
import { pool } from './db.js'
import { criarValidarToken } from './autenticacao/validarToken.js'
import { tratarErros } from './erros.js'
import {
  rotasNotificacoes,
  rotasEventos,
} from './notificacoes/rotas.js'

export function criarApp() {
  const app = express()

  app.disable('x-powered-by')

  app.use(cors({
    origin: config.CORS_ORIGINS,
    optionsSuccessStatus: 200,
  }))

  app.use(express.json({ limit: '100kb' }))

  app.get('/notificacoes/saude', async (req, res) => {
    try {
      await pool.query('SELECT 1')

      res.json({
        servico: 'notificacoes',
        banco: true,
      })
    } catch (erro) {
      console.error('[notificacoes] falha na conexão com o banco:', erro)

      res.status(503).json({
        servico: 'notificacoes',
        banco: false,
      })
    }
  })

  const validarToken = criarValidarToken(config.JWT_SECRET)

  app.use('/notificacoes', validarToken, rotasNotificacoes)
  app.use('/interno/eventos', rotasEventos)

  app.use((req, res) => {
    res.status(404).json({ erro: 'rota não encontrada' })
  })

  app.use(tratarErros)

  return app
}