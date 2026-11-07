const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export const reais = (centavos) => brl.format(centavos / 100)

export const dataHora = (iso) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })

// "50", "50,5" e "50,25" viram 5000, 5050 e 5025
export function paraCentavos(texto) {
  const m = texto.trim().match(/^(\d+)(?:[.,](\d{1,2}))?$/)
  if (!m) return null
  const centavos = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
  return centavos > 0 && centavos <= 100000000 ? centavos : null
}