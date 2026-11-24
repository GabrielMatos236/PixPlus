const baseUrl = (process.env.CONTAS_URL || 'http://contas:3000')
  .replace(/\/+$/, '')

const resposta = await fetch(`${baseUrl}/interno/verificacao`, {
  signal: AbortSignal.timeout(10000),
})

if (!resposta.ok) {
  throw new Error(
    `Verificação de saldos falhou: HTTP ${resposta.status}`,
  )
}

const dados = await resposta.json()

if (
  !Number.isSafeInteger(dados.soma_total) ||
  !Array.isArray(dados.contas_negativas)
) {
  throw new Error('Resposta de verificação em formato inesperado')
}

for (const conta of dados.contas_negativas) {
  if (
    typeof conta.id !== 'string' ||
    !Number.isSafeInteger(conta.saldo) ||
    conta.saldo >= 0
  ) {
    throw new Error('Conta negativa em formato inesperado')
  }
}

console.log(JSON.stringify({
  coletado_em: new Date().toISOString(),
  soma_total: dados.soma_total,
  quantidade_contas_negativas: dados.contas_negativas.length,
  contas_negativas: dados.contas_negativas,
}, null, 2))