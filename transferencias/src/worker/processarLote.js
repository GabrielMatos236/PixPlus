import { pool } from '../db.js'
import { entregarEvento } from './entregarEvento.js'

export async function processarLote(urlNotificacoes) {
  const cliente = await pool.connect()

  try {
    await cliente.query('BEGIN')

    const resultado = await cliente.query(
      `SELECT id, tipo, dados, tentativas
       FROM outbox
       WHERE status = 'pendente'
         AND disponivel_em <= now()
       ORDER BY disponivel_em, id
       LIMIT 50
       FOR UPDATE SKIP LOCKED`,
    )

    let processados = 0
    let falhas = 0

    for (const evento of resultado.rows) {
      let falhaEntrega = null

      try {
        await entregarEvento(evento, urlNotificacoes)
      } catch (erro) {
        falhaEntrega = erro
      }

      if (falhaEntrega) {
        const tentativas = evento.tentativas + 1
        const esperaSegundos = 2 ** evento.tentativas
        const status = tentativas >= 10 ? 'erro' : 'pendente'
        const mensagem = String(
          falhaEntrega.message || falhaEntrega,
        ).slice(0, 1000)

        await cliente.query(
          `UPDATE outbox
           SET tentativas = $2,
               ultimo_erro = $3,
               disponivel_em = now() + ($4 * interval '1 second'),
               status = $5
           WHERE id = $1`,
          [
            evento.id,
            tentativas,
            mensagem,
            esperaSegundos,
            status,
          ],
        )

        falhas++
      } else {
        await cliente.query(
          `UPDATE outbox
           SET status = 'processado',
               processado_em = now(),
               ultimo_erro = NULL
           WHERE id = $1`,
          [evento.id],
        )

        processados++
      }
    }

    await cliente.query('COMMIT')

    return {
      encontrados: resultado.rowCount,
      processados,
      falhas,
    }
  } catch (erro) {
    await cliente.query('ROLLBACK')
    throw erro
  } finally {
    cliente.release()
  }
}