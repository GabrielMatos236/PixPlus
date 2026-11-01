export async function chamar(caminho, { metodo = 'GET', corpo } = {}) {
  const token = localStorage.getItem('token')
  const resposta = await fetch(caminho, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  const dados = await resposta.json().catch(() => ({}))
  if (!resposta.ok) {
    // o Auth responde { erro, detalhes?: [{ campo, mensagem }] }
    const detalhes = dados.detalhes?.map((d) => `${d.campo}: ${d.mensagem}`).join('; ')
    const erro = new Error(detalhes || dados.erro || 'Algo deu errado')
    erro.status = resposta.status
    throw erro
  }
  return dados
}