import { z } from 'zod'

// Lê e confere as variáveis de ambiente uma vez só, na subida.
// Se faltar alguma, o serviço nem liga: melhor falhar na hora do que no meio de um cadastro.
const esquema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  PORT: z.coerce.number().int().positive().default(3000),
  JWT_SECRET: z.string().min(32, 'precisa ter pelo menos 32 caracteres'),
})

const resultado = esquema.safeParse(process.env)

if (!resultado.success) {
  console.error('[auth] configuração inválida:')
  for (const problema of resultado.error.issues) {
    console.error(`  - ${problema.path.join('.')}: ${problema.message}`)
  }
  process.exit(1)
}

export const config = resultado.data
