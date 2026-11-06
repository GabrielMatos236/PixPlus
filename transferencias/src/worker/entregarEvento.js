export async function entregarEvento(evento, urlNotificacoes) {
  const baseUrl = urlNotificacoes.replace(/\/+$/, '')

  const resposta = await fetch(`${baseUrl}/interno/eventos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: evento.id,
      tipo: evento.tipo,
      dados: evento.dados,
    }),
    signal: AbortSignal.timeout(5000),
  })

  const status = resposta.status
  const entregue = resposta.ok

  await resposta.body?.cancel()

  if (!entregue) {
    throw new Error(`Notificações respondeu HTTP ${status}`)
  }
}