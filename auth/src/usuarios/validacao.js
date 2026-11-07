import { z } from 'zod'

// Confere os dois dígitos verificadores do CPF (regra oficial da Receita).
export function cpfValido(cpf) {
  if (!/^\d{11}$/.test(cpf)) return false
  if (/^(\d)\1{10}$/.test(cpf)) return false // 000.000.000-00, 111..., etc.

  const digitos = cpf.split('').map(Number)
  const calcularDigito = (quantidade) => {
    let soma = 0
    for (let i = 0; i < quantidade; i++) soma += digitos[i] * (quantidade + 1 - i)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }

  return calcularDigito(9) === digitos[9] && calcularDigito(10) === digitos[10]
}

// Mensagem para campo ausente ou com tipo errado (ex.: número no lugar de texto).
// Sem isso o zod responde em inglês: "Invalid input: expected string, received undefined".
const texto = (campo) => z.string({ error: `${campo} é obrigatório e deve ser texto` })

export const esquemaCadastro = z.object({
  nome: texto('nome').trim().min(2, 'nome muito curto').max(100, 'nome muito longo'),
  email: texto('email').trim().toLowerCase().pipe(z.email('e-mail inválido')),
  cpf: texto('cpf')
    .transform((cpf) => cpf.replace(/\D/g, '')) // aceita com ou sem pontos e traço
    .refine(cpfValido, 'cpf inválido'),
  senha: texto('senha')
    .min(8, 'a senha precisa ter pelo menos 8 caracteres')
    .max(128, 'a senha pode ter no máximo 128 caracteres'),
}, { error: 'o corpo precisa ser um objeto JSON' })

export const esquemaLogin = z.object({
  email: texto('email').trim().toLowerCase().pipe(z.email('e-mail inválido')),
  senha: texto('senha').min(1, 'informe a senha').max(128, 'senha muito longa'),
}, { error: 'o corpo precisa ser um objeto JSON' })
