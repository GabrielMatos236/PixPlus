import { z } from 'zod'

// Lê e confere as variáveis de ambiente uma vez só, na subida.
// Se faltar alguma, o serviço nem liga: melhor falhar na hora do que no meio de um cadastro.
const esquema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  PORT: z.coerce.number().int().positive().default(3000),
  JWT_SECRET: z.string().min(32, 'precisa ter pelo menos 32 caracteres'),
  // Id do projeto no Firebase (não é segredo: o front também usa). Opcional: sem ele
  // o resto do Auth funciona e só POST /auth/firebase responde 503.
  // O compose manda vazio quando não está no .env, e vazio conta como "não tem".
  FIREBASE_PROJECT_ID: z
    .string()
    .optional()
    .transform((id) => id?.trim() || undefined)
    .pipe(z.string().regex(/^[a-z0-9-]{4,40}$/, 'id de projeto do firebase inválido').optional()),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((lista) => lista.split(',').map((origem) => origem.trim()))
    .pipe(z.array(z.url({ protocol: /^https?$/, error: 'cada origem precisa começar com http:// ou https://' }))),
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
