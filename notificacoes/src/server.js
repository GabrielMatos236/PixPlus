import { config } from './config.js'
import { pool } from './db.js'
import { criarApp } from './app.js'

const servidor = criarApp().listen(config.PORT, '0.0.0.0', () => {
  console.log(`[notificacoes] no ar na porta ${config.PORT}`)
})

let desligando = false

function desligar(sinal) {
  if (desligando) return
  desligando = true

  console.log(`[notificacoes] recebi ${sinal}, desligando`)

  const prazo = setTimeout(() => {
    console.error('[notificacoes] tempo de desligamento esgotado')
    process.exit(1)
  }, 10000)

  prazo.unref()

  servidor.close(async () => {
    try {
      await pool.end()
      clearTimeout(prazo)
      process.exit(0)
    } catch (erro) {
      console.error('[notificacoes] falha ao desligar:', erro)
      process.exit(1)
    }
  })
}

process.on('SIGTERM', desligar)
process.on('SIGINT', desligar)