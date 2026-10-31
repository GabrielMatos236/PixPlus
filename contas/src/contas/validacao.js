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