import { z } from 'zod'

const esquema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  JWT_SECRET: z.string().min(32, 'precisa ter pelo menos 32 caracteres'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((lista) => lista.split(',').map((origem) => origem.trim()))
    .pipe(z.array(z.url({ protocol: /^https?$/ }))),
})

const resultado = esquema.safeParse(process.env)

if (!resultado.success) {
  console.error('[notificacoes] configuração inválida:')

  for (const problema of resultado.error.issues) {
    console.error(`  - ${problema.path.join('.')}: ${problema.message}`)
  }

  process.exit(1)
}

export const config = resultado.data