import express from 'express'
import pg from 'pg'

const app = express()
app.use(express.json()) //-> deixa o servidor ler o corpo JSON das requisições
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }) //-> conexão com o banco auth

app.get('/auth/saude', async (req, res) => {
  const { rows } = await pool.query('SELECT 1 AS ok') //-> rota de health check
  res.json({ servico: 'auth', banco: rows[0].ok === 1 })
})

const porta = Number(process.env.PORT ?? 3000)
app.listen(porta, '0.0.0.0', () => console.log('[auth] no ar'))