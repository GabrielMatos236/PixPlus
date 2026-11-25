// Um Contas de mentira, só com as rotas /interno que Transferências chama.
// Roda numa porta livre do próprio processo de teste. Assim os testes do Pix
// não dependem do serviço Contas de verdade estar no ar.
import { randomUUID } from 'node:crypto'
import express from 'express'

export async function criarContasFalso() {
  const contas = [] // { id, usuario_id, chave_pix, saldo }
  const movimentacoes = [] // corpos recebidos em POST /interno/movimentacoes
  // atrasoMs: segura as respostas, para dois pedidos ao mesmo tempo se cruzarem.
  // aoMovimentar: função chamada antes de responder a movimentação (simula algo
  // acontecendo em Transferências enquanto Contas trabalha).
  // falharProximas: as próximas N requisições recebem 503 (Contas "piscou").
  // depoisDeMovimentar: chamada DEPOIS de mover o dinheiro e antes de responder
  // (simula Contas que fez o trabalho mas demorou a responder).
  const estado = {
    foraDoAr: false,
    movimentacaoForaDoAr: false,
    atrasoMs: 0,
    aoMovimentar: null,
    falharProximas: 0,
    movimentacaoFalharProximas: 0,
    depoisDeMovimentar: null,
  }
  const jaMovidas = new Set() // transferencia_id que já moveu dinheiro

  const app = express()
  app.use(express.json())

  app.use(async (req, res, next) => {
    if (estado.foraDoAr) return res.status(503).json({ erro: 'fora do ar' })
    if (estado.falharProximas > 0) {
      estado.falharProximas--
      return res.status(503).json({ erro: 'fora do ar' })
    }
    if (estado.atrasoMs) await new Promise((resolve) => setTimeout(resolve, estado.atrasoMs))
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

  app.post('/interno/movimentacoes', async (req, res) => {
    if (estado.movimentacaoForaDoAr) return res.status(503).json({ erro: 'fora do ar' })
    if (estado.movimentacaoFalharProximas > 0) {
      estado.movimentacaoFalharProximas--
      return res.status(503).json({ erro: 'fora do ar' })
    }
    if (estado.aoMovimentar) await estado.aoMovimentar(req.body)
    movimentacoes.push(req.body)

    const { transferencia_id, conta_origem, conta_destino, valor } = req.body

    // Como o Contas de verdade na etapa 3: o mesmo transferencia_id não lança de
    // novo. A repetição só confirma (200), sem mexer no dinheiro.
    if (jaMovidas.has(transferencia_id)) {
      const origemRepetida = contas.find((c) => c.id === conta_origem)
      return res.status(200).json({ transferencia_id, saldo_origem: origemRepetida?.saldo })
    }

    const origem = contas.find((c) => c.id === conta_origem)
    const destino = contas.find((c) => c.id === conta_destino)
    if (!origem) return res.status(404).json({ erro: 'conta de origem não encontrada' })
    if (!destino) return res.status(404).json({ erro: 'conta de destino não encontrada' })
    if (origem.saldo < valor) return res.status(422).json({ erro: 'saldo insuficiente' })

    origem.saldo -= valor
    destino.saldo += valor
    jaMovidas.add(transferencia_id)
    if (estado.depoisDeMovimentar) await estado.depoisDeMovimentar(req.body)
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
    // Como se uma movimentação com esse id já tivesse acontecido antes.
    marcarComoMovida(transferenciaId) {
      jaMovidas.add(transferenciaId)
    },
    limpar() {
      contas.length = 0
      movimentacoes.length = 0
      estado.foraDoAr = false
      estado.movimentacaoForaDoAr = false
      estado.atrasoMs = 0
      estado.aoMovimentar = null
      estado.falharProximas = 0
      estado.movimentacaoFalharProximas = 0
      estado.depoisDeMovimentar = null
      jaMovidas.clear()
    },
    fechar() {
      return new Promise((resolve) => servidor.close(resolve))
    },
  }
}
