const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export const reais = (centavos) => brl.format(centavos / 100)

export const dataHora = (iso) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })

export function paraCentavos(texto) {
  let t = texto.trim()
  // "1.000,50" e "1.000" usam ponto de milhar; "50.5" continua sendo decimal
  if (t.includes(',') || /^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
  const m = t.match(/^(\d+)(?:[.,](\d{1,2}))?$/)
  if (!m) return null
  const centavos = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
  return centavos > 0 && centavos <= 100000000 ? centavos : null
}