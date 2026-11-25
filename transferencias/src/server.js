import { config } from './config.js'
import { pool } from './db.js'
import { criarApp } from './app.js'
import { iniciarRotinaDePendentes } from './pendentes/rotina.js'

const servidor = criarApp().listen(config.PORT, '0.0.0.0', () => {
  console.log(`[transferencias] no ar na porta ${config.PORT}`)
})

// A cada minuto, termina os Pix que ficaram pendentes (src/pendentes/rotina.js).
// Fica aqui, e não no app, para os testes não ligarem o relógio sozinhos.
const rotina = iniciarRotinaDePendentes()

// Desligamento educado: quando o Docker manda parar, termina as requisições
// em andamento e a rodada da rotina, e fecha as conexões com o banco antes de sair.
function desligar(sinal) {
  console.log(`[transferencias] recebi ${sinal}, desligando`)
  servidor.close(async () => {
    await rotina.parar()
    await pool.end()
    process.exit(0)
  })
}

process.on('SIGTERM', desligar)
process.on('SIGINT', desligar)
