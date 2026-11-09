import { pool } from '../db.js'

// Tudo que Transferências grava ou lê no próprio banco passa por aqui.
// O ciclo de vida de uma transferência:
//
//   criarPendente ──► (chama Contas) ──► concluir  → status concluida + evento na outbox
//                                    └─► falhar    → status falhou + motivo
//
// Se Contas estiver fora do ar, nenhum dos dois roda e ela fica pendente.
// A rotina da etapa 3 reprocessa essas.

// O Postgres recusa (com erro, que virava 500) um id que não tem formato de UUID.
// Conferir antes deixa "GET /transferencias/abc" responder 404.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function criarPendente({
  chaveIdempotencia,
  usuarioOrigem,
  contaOrigem,
  usuarioDestino,
  contaDestino,
  chaveDestino,
  valor,
}) {
  const { rows } = await pool.query(
    `INSERT INTO transferencia
       (chave_idempotencia, usuario_origem, conta_origem, usuario_destino, conta_destino, chave_destino, valor)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [chaveIdempotencia, usuarioOrigem, contaOrigem, usuarioDestino, contaDestino, chaveDestino, valor],
  )
  return rows[0]
}

// Muda o status para concluida e grava o evento na outbox NA MESMA TRANSAÇÃO.
// Ou entram os dois, ou nenhum: nunca existe Pix concluído sem aviso,
// nem aviso de um Pix que não concluiu.
//
// O "WHERE status = 'pendente'" impede concluir duas vezes. Se a transferência
// já saiu de pendente, nada é gravado e a função devolve null.
export async function concluir(id) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows } = await client.query(
      `UPDATE transferencia SET status = 'concluida'
       WHERE id = $1 AND status = 'pendente'
       RETURNING *`,
      [id],
    )
    const transferencia = rows[0]
    if (!transferencia) {
      await client.query('ROLLBACK')
      return null
    }

    // Os seis campos do contrato (docs/contratos.md, "Evento transferencia.concluida").
    // Notificações recusa o evento se faltar algum.
    const dados = {
      transferencia_id: transferencia.id,
      usuario_origem: transferencia.usuario_origem,
      usuario_destino: transferencia.usuario_destino,
      chave_destino: transferencia.chave_destino,
      valor: transferencia.valor,
      concluida_em: transferencia.atualizada_em.toISOString(), // o trigger acabou de gravar now()
    }
    await client.query(
      `INSERT INTO outbox (tipo, dados) VALUES ('transferencia.concluida', $1)`,
      [dados],
    )

    await client.query('COMMIT')
    return transferencia
  } catch (erro) {
    await client.query('ROLLBACK')
    throw erro
  } finally {
    client.release()
  }
}

// Contas recusou (saldo insuficiente, conta sumiu). Grava o motivo para o
// GET /transferencias/:id mostrar depois. Mesma trava de status do concluir.
export async function falhar(id, motivo) {
  const { rows } = await pool.query(
    `UPDATE transferencia SET status = 'falhou', motivo_falha = $2
     WHERE id = $1 AND status = 'pendente'
     RETURNING *`,
    [id, motivo],
  )
  return rows[0] ?? null
}

export async function buscarPorId(id) {
  if (!UUID.test(id)) return null
  const { rows } = await pool.query('SELECT * FROM transferencia WHERE id = $1', [id])
  return rows[0] ?? null
}