import { pool } from '../db.js'
// Mesmo formato do front: "R$ 1.234.567,89". O Intl separa "R$" do número com
// um espaço não separável (\u00a0); trocado por espaço comum para o texto
// gravado ser o mesmo que se digita num teste ou numa busca.
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const formatarReais = (centavos) => brl.format(centavos / 100).replace(/\u00a0/g, ' ')

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

    const valorFormatado = formatarReais(dados.valor)

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

export async function excluirNotificacao(id, usuarioId) {
  const resultado = await pool.query(
    `DELETE FROM notificacao
     WHERE id = $1 AND usuario_id = $2
     RETURNING id`,
    [id, usuarioId],
  )

  return resultado.rowCount > 0
}