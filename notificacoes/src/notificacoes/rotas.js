import { Router } from 'express'
import { z } from 'zod'
import { ErroHttp } from '../erros.js'
import {
  listarNotificacoes,
  marcarComoLida,
  receberEvento,
} from './repositorio.js'

export const rotasNotificacoes = Router()

const esquemaPaginacao = z.object({
  pagina: z.coerce.number().int().positive().default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
})

const esquemaLeitura = z.object({
  lida: z.literal(true),
}).strict()

rotasNotificacoes.get('/', async (req, res) => {
  const validacao = esquemaPaginacao.safeParse(req.query)

  if (!validacao.success) {
    throw new ErroHttp(400, 'paginação inválida')
  }

  const { pagina, limite } = validacao.data

  if (!Number.isSafeInteger((pagina - 1) * limite)) {
    throw new ErroHttp(400, 'paginação inválida')
  }

  const resultado = await listarNotificacoes(
    req.usuarioId,
    pagina,
    limite,
  )

  res.json(resultado)
})

rotasNotificacoes.patch('/:id', async (req, res) => {
  const corpo = esquemaLeitura.safeParse(req.body)

  if (!corpo.success) {
    throw new ErroHttp(400, 'corpo inválido: envie { "lida": true }')
  }

  const id = z.uuid().safeParse(req.params.id)

  if (!id.success) {
    throw new ErroHttp(404, 'notificação não encontrada')
  }

  const notificacao = await marcarComoLida(
    id.data,
    req.usuarioId,
  )

  if (!notificacao) {
    throw new ErroHttp(404, 'notificação não encontrada')
  }

  res.json(notificacao)
})

export const rotasEventos = Router()

const esquemaEvento = z.object({
  id: z.uuid(),
  tipo: z.literal('transferencia.concluida'),
  dados: z.object({
    transferencia_id: z.uuid(),
    usuario_origem: z.uuid(),
    usuario_destino: z.uuid(),
    chave_destino: z.string().trim().min(1),
    valor: z.number().int().positive(),
    concluida_em: z.iso.datetime({ offset: true }),
  }),
})

rotasEventos.post('/', async (req, res) => {
  const validacao = esquemaEvento.safeParse(req.body)

  if (!validacao.success) {
    throw new ErroHttp(400, 'evento inválido')
  }

  await receberEvento(validacao.data)

  res.status(204).end()
})