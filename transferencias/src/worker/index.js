// Worker da outbox — dona: pessoa D. Revisão: pessoa C.
import { setTimeout as esperar } from 'node:timers/promises'
import { pool } from '../db.js'
import { processarLote } from './processarLote.js'

const urlNotificacoes =
  process.env.NOTIFICACOES_URL || 'http://notificacoes:3000'

const endereco = new URL(urlNotificacoes)

if (!['http:', 'https:'].includes(endereco.protocol)) {
  throw new Error('NOTIFICACOES_URL deve usar http ou https')
}

let executando = true

function solicitarParada(sinal) {
  console.log(`[worker] recebi ${sinal}, encerrando após o lote atual`)
  executando = false
}

process.once('SIGTERM', () => solicitarParada('SIGTERM'))
process.once('SIGINT', () => solicitarParada('SIGINT'))

async function iniciar() {
  console.log('[worker] iniciado')

  try {
    while (executando) {
      try {
        const resultado = await processarLote(urlNotificacoes)

        if (resultado.encontrados > 0) {
          console.log(
            `[worker] processados: ${resultado.processados}, ` +
            `falhas: ${resultado.falhas}`,
          )
        } else if (executando) {
          await esperar(1000)
        }
      } catch (erro) {
        console.error('[worker] falha ao processar lote:', erro)

        if (executando) {
          await esperar(2000)
        }
      }
    }
  } finally {
    await pool.end()
    console.log('[worker] encerrado')
  }
}

iniciar().catch((erro) => {
  console.error('[worker] falha ao encerrar:', erro)
  process.exitCode = 1
})
