const endereco = process.env.DATABASE_URL

if (!endereco) {
  throw new Error('Defina DATABASE_URL para o banco de testes')
}

const nomeBanco = decodeURIComponent(
  new URL(endereco).pathname.slice(1),
)

if (!nomeBanco.endsWith('_test')) {
  throw new Error(
    `Testes recusados no banco "${nomeBanco}": use um banco terminado em _test`,
  )
}