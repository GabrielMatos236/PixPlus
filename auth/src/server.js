import { config } from './config.js'
import { pool } from './db.js'
import { criarApp } from './app.js'

const servidor = criarApp().listen(config.PORT, '0.0.0.0', () => {
  console.log(`[auth] no ar na porta ${config.PORT}`)
})

// Desligamento educado: quando o Docker manda parar, termina as requisições
// em andamento e fecha as conexões com o banco antes de sair.
function desligar(sinal) {
  console.log(`[auth] recebi ${sinal}, desligando`)
  servidor.close(async () => {
    await pool.end()
    process.exit(0)
  })
}

process.on('SIGTERM', desligar)
process.on('SIGINT', desligar)
