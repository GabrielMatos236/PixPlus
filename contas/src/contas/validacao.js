import { z } from 'zod'
import { ErroHttp } from '../erros.js'

// Valor máximo de um depósito: R$ 1.000.000,00. A coluna valor é INTEGER
// (até ~R$ 21 milhões); sem limite, um valor maior estourava a coluna e virava 500.
export const DEPOSITO_MAXIMO = 100_000_000

// Chave pix sempre salva e buscada do mesmo jeito: sem espaços nas pontas e em
// minúsculas. Assim "Maria@Pix " e "maria@pix" são a mesma chave.
// O trim vem ANTES do min(1): na ordem inversa, "   " passava e virava "".
export const chavePix = z
  .string({ error: 'chave_pix é obrigatória e deve ser texto' })
  .trim()
  .toLowerCase()
  .min(1, 'chave_pix não pode ser vazia')
  .max(140, 'chave_pix pode ter no máximo 140 caracteres')

const corpoObjeto = { error: 'o corpo precisa ser um objeto JSON' }

export const esquemaCriarConta = z.object({ chave_pix: chavePix }, corpoObjeto)

export const esquemaDeposito = z.object({
  valor: z
    .number({ error: 'valor é obrigatório e deve ser número' })
    .int('valor deve ser inteiro (centavos)')
    .positive('valor deve ser maior que zero')
    .max(DEPOSITO_MAXIMO, 'valor máximo por depósito é R$ 1.000.000,00'),
}, corpoObjeto)

export const esquemaMovimentacao = z.object({
  transferencia_id: z
    .string({ error: 'transferencia_id é obrigatória e deve ser texto' })
    .uuid('transferencia_id deve ser um UUID válido'),
  conta_origem: z
    .string({ error: 'conta_origem é obrigatória e deve ser texto' })
    .uuid('conta_origem deve ser um UUID válido'),
  conta_destino: z
    .string({ error: 'conta_destino é obrigatória e deve ser texto' })
    .uuid('conta_destino deve ser um UUID válido'),
  valor: z
    .number({ error: 'valor é obrigatório e deve ser número' })
    .int('valor deve ser inteiro (centavos)')
    .positive('valor deve ser maior que zero'),
}, corpoObjeto)

export const esquemaPaginacao = z.object({
  pagina: z.coerce
    .number({ error: 'pagina deve ser número' })
    .int('pagina deve ser inteiro')
    .positive('pagina começa em 1')
    .default(1),
  limite: z.coerce
    .number({ error: 'limite deve ser número' })
    .int('limite deve ser inteiro')
    .min(1, 'limite mínimo é 1')
    .max(100, 'limite máximo é 100')
    .default(20),
})

// Busca interna: exatamente um dos dois, chave ou usuario_id.
export const esquemaBuscaInterna = z
  .object({
    chave: chavePix.optional(),
    usuario_id: z.uuid('usuario_id deve ser um UUID').optional(),
  })
  .refine((q) => (q.chave === undefined) !== (q.usuario_id === undefined), {
    error: 'informe chave ou usuario_id (só um dos dois)',
  })

export function validar(esquema, dados) {
  // No Express 5, uma requisição sem corpo chega com req.body undefined.
  const resultado = esquema.safeParse(dados ?? {})
  if (resultado.success) return resultado.data

  const detalhes = resultado.error.issues.map((problema) => ({
    campo: problema.path.join('.'),
    mensagem: problema.message,
  }))

  throw new ErroHttp(400, 'dados inválidos', detalhes)
}
