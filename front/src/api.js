// cabecalhos: cabeçalhos extras só daquela chamada (ex.: Idempotency-Key no Pix).
export async function chamar(caminho, { metodo = 'GET', corpo, cabecalhos } = {}) {
  const token = localStorage.getItem('token')
  const resposta = await fetch(caminho, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...cabecalhos,
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  const dados = await resposta.json().catch(() => ({}))
  if (!resposta.ok) {
    // o Auth responde { erro, detalhes?: [{ campo, mensagem }] }
    const detalhes = dados.detalhes?.map((d) => `${d.campo}: ${d.mensagem}`).join('; ')
    const erro = new Error(detalhes || dados.erro || 'Algo deu errado')
    erro.status = resposta.status
    erro.dados = dados
    throw erro
  }
  return dados
}

// UUID v4 para a Idempotency-Key. Não usa crypto.randomUUID() porque ele só
// existe em "contexto seguro" (https ou localhost): abrindo o app no celular
// pelo IP do notebook (http://192.168...), ele não existe e o Pix quebraria.
// crypto.getRandomValues funciona em qualquer página.
export function gerarUuid() {
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40 // versão 4
  b[8] = (b[8] & 0x3f) | 0x80 // variante
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
