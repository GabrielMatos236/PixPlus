// O Postgres não aceita o caractere \u0000 em colunas de texto: sem esta trava,
// um nome ou chave com "\u0000" estoura no INSERT/SELECT e vira 500.
// Vale para o corpo (JSON) e para a query string (?chave=... do /interno/contas).
function temCaractereNulo(valor) {
  if (typeof valor === 'string') return valor.includes('\u0000')
  if (valor && typeof valor === 'object') return Object.values(valor).some(temCaractereNulo)
  return false
}

export function recusarCaractereNulo(req, res, next) {
  if (temCaractereNulo(req.body) || temCaractereNulo(req.query)) {
    return res.status(400).json({ erro: 'dados inválidos: o texto não pode ter o caractere nulo (\\u0000)' })
  }
  next()
}
