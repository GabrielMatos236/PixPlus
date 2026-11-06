import { pool } from '../db.js'

export async function listarNotificacoes(usuarioId, pagina, limite) {
  const deslocamento = (pagina - 1) * limite

  const resultado = await pool.query(
    `SELECT id, mensagem, lida, criada_em
     FROM notificacao
     WHERE usuario_id = $1
     ORDER BY criada_em DESC, id DESC
     LIMIT $2 OFFSET $3`,
    [usuarioId, limite, deslocamento],
  )

  const contagem = await pool.query(
    `SELECT count(*) AS total
     FROM notificacao
     WHERE usuario_id = $1`,
    [usuarioId],
  )

  const total = Number(contagem.rows[0].total)

  return {
    notificacoes: resultado.rows,
    total,
    pagina,
    limite,
    paginas: Math.ceil(total / limite),
  }
}

export async function marcarComoLida(id, usuarioId) {
  const resultado = await pool.query(
    `UPDATE notificacao
     SET lida = true
     WHERE id = $1 AND usuario_id = $2
     RETURNING id, mensagem, lida, criada_em`,
    [id, usuarioId],
  )

  return resultado.rows[0] ?? null
}

export async function receberEvento(evento) {
  const cliente = await pool.connect()

  try {
    await cliente.query('BEGIN')

    const insercao = await cliente.query(
      `INSERT INTO evento_recebido (id)
       VALUES ($1)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [evento.id],
    )

    if (insercao.rowCount === 0) {
      await cliente.query('COMMIT')
      return
    }

    const dados = evento.dados

    const reais = Math.floor(dados.valor / 100)
    const centavos = String(dados.valor % 100).padStart(2, '0')
    const valorFormatado = `R$ ${reais},${centavos}`

    await cliente.query(
      `INSERT INTO notificacao (evento_id, usuario_id, mensagem)
       VALUES ($1, $2, $3), ($1, $4, $5)`,
      [
        evento.id,
        dados.usuario_origem,
        `Você enviou um Pix de ${valorFormatado}.`,
        dados.usuario_destino,
        `Você recebeu um Pix de ${valorFormatado}.`,
      ],
    )

    await cliente.query('COMMIT')
  } catch (erro) {
    await cliente.query('ROLLBACK')
    throw erro
  } finally {
    cliente.release()
  }
}