// Um Contas de mentira, só com as rotas /interno que Transferências chama.
// Roda numa porta livre do próprio processo de teste. Assim os testes do Pix
// não dependem do serviço Contas de verdade estar no ar.
import { randomUUID } from 'node:crypto'
import express from 'express'

export async function criarContasFalso() {
  const contas = [] // { id, usuario_id, chave_pix, saldo }
  const movimentacoes = [] // corpos recebidos em POST /interno/movimentacoes
  const estado = { foraDoAr: false, movimentacaoForaDoAr: false }

  const app = express()
  app.use(express.json())

  app.use((req, res, next) => {
    if (estado.foraDoAr) return res.status(503).json({ erro: 'fora do ar' })
    next()
  })

  app.get('/interno/contas', (req, res) => {
    const { chave, usuario_id } = req.query
    const conta = chave !== undefined
      ? contas.find((c) => c.chave_pix === chave)
      : contas.find((c) => c.usuario_id === usuario_id)
    if (!conta) {
      return res.status(404).json({ erro: chave !== undefined ? 'chave pix não encontrada' : 'usuário sem conta' })
    }
    res.json({ id: conta.id, usuario_id: conta.usuario_id })
  })

  app.post('/interno/movimentacoes', (req, res) => {
    if (estado.movimentacaoForaDoAr) return res.status(503).json({ erro: 'fora do ar' })
    movimentacoes.push(req.body)

    const { transferencia_id, conta_origem, conta_destino, valor } = req.body
    const origem = contas.find((c) => c.id === conta_origem)
    const destino = contas.find((c) => c.id === conta_destino)
    if (!origem) return res.status(404).json({ erro: 'conta de origem não encontrada' })
    if (!destino) return res.status(404).json({ erro: 'conta de destino não encontrada' })
    if (origem.saldo < valor) return res.status(422).json({ erro: 'saldo insuficiente' })

    origem.saldo -= valor
    destino.saldo += valor
    res.status(201).json({ transferencia_id, saldo_origem: origem.saldo })
  })

  const servidor = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })

  return {
    url: `http://127.0.0.1:${servidor.address().port}`,
    contas,
    movimentacoes,
    estado,
    adicionarConta(chavePix, saldo = 0) {
      const conta = { id: randomUUID(), usuario_id: randomUUID(), chave_pix: chavePix, saldo }
      contas.push(conta)
      return conta
    },
    limpar() {
      contas.length = 0
      movimentacoes.length = 0
      estado.foraDoAr = false
      estado.movimentacaoForaDoAr = false
    },
    fechar() {
      return new Promise((resolve) => servidor.close(resolve))
    },
  }
}
