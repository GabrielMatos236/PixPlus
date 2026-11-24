import { z } from 'zod'
import { ErroHttp } from '../erros.js'

// Mesmo limite do depósito e da movimentação em Contas: R$ 1.000.000,00.
// Conferir aqui evita criar uma transferência que Contas vai recusar com 400.
export const VALOR_MAXIMO = 100_000_000

const corpoObjeto = { error: 'o corpo precisa ser um objeto JSON' }

export const esquemaPix = z.object({
  // Mesma normalização de Contas: sem espaços nas pontas e em minúsculas.
  // Assim a chave gravada na transferência é a mesma que aparece no aviso.
  chave_destino: z
    .string({ error: 'chave_destino é obrigatória e deve ser texto' })
    .trim()
    .toLowerCase()
    .min(1, 'chave_destino não pode ser vazia')
    .max(140, 'chave_destino pode ter no máximo 140 caracteres'),
  valor: z
    .number({ error: 'valor é obrigatório e deve ser número' })
    .int('valor deve ser inteiro (centavos)')
    .positive('valor deve ser maior que zero')
    .max(VALOR_MAXIMO, 'valor máximo por Pix é R$ 1.000.000,00'),
}, corpoObjeto)

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

// Cabeçalho Idempotency-Key: o cliente gera um UUID por Pix (crypto.randomUUID())
// e manda o MESMO de novo se precisar repetir aquele Pix (erro de rede, timeout).
// Exigir UUID deixa a regra simples de explicar e de conferir.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function lerChaveIdempotencia(req) {
  const chave = req.get('Idempotency-Key')?.trim()
  if (!chave) throw new ErroHttp(400, 'o cabeçalho Idempotency-Key é obrigatório')
  if (!UUID.test(chave)) throw new ErroHttp(400, 'o cabeçalho Idempotency-Key deve ser um UUID')
  // Minúsculas: o mesmo UUID escrito em maiúsculas é a mesma chave.
  return chave.toLowerCase()
}
