import { z } from 'zod'
import { ErroHttp } from '../erros.js'

export const esquemaCriarConta = z.object({
  chave_pix: z
    .string({ required_error: 'chave_pix é obrigatória' })
    .min(1, 'chave_pix não pode ser vazia')
    .max(140, 'chave_pix pode ter no máximo 140 caracteres')
    .trim(),
})

export function validar(esquema, dados) {
  const resultado = esquema.safeParse(dados)
  if (resultado.success) return resultado.data

  const detalhes = resultado.error.issues.map((problema) => ({
    campo: problema.path.join('.'),
    mensagem: problema.message,
  }))

  throw new ErroHttp(400, 'dados inválidos', detalhes)
}

export const esquemaDeposito = z.object({
  valor: z
    .number({ required_error: 'valor é obrigatório' })
    .int('valor deve ser inteiro (centavos)')
    .positive('valor deve ser maior que zero'),
})

export const esquemaPaginacao = z.object({
  pagina: z.coerce.number().int().positive().default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
})