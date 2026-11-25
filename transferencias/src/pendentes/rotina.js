import { ErroHttp } from '../erros.js'
import { concluir, falhar, reservarPendentes } from '../transferencias/repositorio.js'
import { movimentar } from '../contas/clienteContas.js'

// Rotina de pendentes: termina os Pix que ficaram "pendente" porque Contas
// caiu (ou não respondeu a tempo) no meio da movimentação.
//
// Repetir a movimentação é seguro: Contas não lança duas vezes o mesmo
// transferencia_id. Se o dinheiro já tinha sido movido, Contas só confirma,
// e aqui a transferência vira concluida (com o evento na outbox, para o
// aviso chegar). Se Contas recusar, vira falhou com o motivo.
//
// Roda em todas as réplicas de Transferências; reservarPendentes garante que
// cada transferência é pega por uma réplica só.
export async function reprocessarPendentes() {
  const pendentes = await reservarPendentes()
  const resumo = { reservadas: pendentes.length, concluidas: 0, falharam: 0, continuamPendentes: 0 }

  for (const [i, transferencia] of pendentes.entries()) {
    let resultado
    try {
      resultado = await movimentar({
        transferenciaId: transferencia.id,
        contaOrigem: transferencia.conta_origem,
        contaDestino: transferencia.conta_destino,
        valor: transferencia.valor,
      })
    } catch (erro) {
      if (erro instanceof ErroHttp && erro.status === 503) {
        // Contas continua fora do ar: não adianta tentar o resto agora.
        // Todas já foram reservadas, então voltam daqui a 1 minuto.
        resumo.continuamPendentes += pendentes.length - i
        break
      }
      // Erro inesperado numa transferência não para as outras.
      console.error(`[transferencias] rotina de pendentes: erro na transferência ${transferencia.id}:`, erro)
      resumo.continuamPendentes++
      continue
    }

    // concluir/falhar devolvem null se outra pessoa (o próprio POST, que
    // terminou atrasado) já tirou a transferência de pendente. Nada a fazer.
    if (resultado.concluida) {
      if (await concluir(transferencia.id)) resumo.concluidas++
    } else if (await falhar(transferencia.id, resultado.motivo)) {
      resumo.falharam++
    }
  }

  return resumo
}

// Liga a rotina a cada `intervaloMs` (1 minuto). Uma rodada nunca começa
// antes da anterior terminar. parar() espera a rodada em andamento acabar,
// para o desligamento não cortar um Pix no meio.
export function iniciarRotinaDePendentes({ intervaloMs = 60_000 } = {}) {
  let emAndamento = null

  const rodar = () => {
    if (emAndamento) return
    emAndamento = reprocessarPendentes()
      .then((resumo) => {
        if (resumo.reservadas > 0) {
          console.log('[transferencias] rotina de pendentes:', JSON.stringify(resumo))
        }
      })
      .catch((erro) => console.error('[transferencias] rotina de pendentes falhou:', erro))
      .finally(() => { emAndamento = null })
  }

  const relogio = setInterval(rodar, intervaloMs)

  return {
    async parar() {
      clearInterval(relogio)
      await emAndamento
    },
  }
}
