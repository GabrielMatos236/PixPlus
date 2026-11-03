// Worker da outbox — dona: pessoa D. Revisão: pessoa C.
//
// Roda como processo separado do serviço (npm run worker), mas mora nesta pasta
// porque lê o banco de Transferências. Pode rodar em várias cópias ao mesmo tempo.
// Usa o mesmo src/db.js e src/config.js do serviço, então precisa das mesmas
// variáveis de ambiente (DATABASE_URL e JWT_SECRET), mais o endereço de Notificações.
//
// O que ele faz está em docs/contratos.md, seção "Eventos (outbox)". Resumo:
//   1. Numa transação, pega até 50 eventos pendentes e já disponíveis, travando com
//      FOR UPDATE SKIP LOCKED (outra cópia do worker pula os que estão travados):
//
//        SELECT id, tipo, dados FROM outbox
//        WHERE status = 'pendente' AND disponivel_em <= now()
//        ORDER BY disponivel_em
//        LIMIT 50
//        FOR UPDATE SKIP LOCKED
//
//   2. Para cada um, POST /interno/eventos em Notificações com { id, tipo, dados }.
//   3. Resposta 2xx:  status = 'processado', processado_em = now().
//      Outra coisa:   tentativas + 1, ultimo_erro, disponivel_em = now() + 2^tentativas segundos.
//                     Na 10ª falha, status = 'erro'.
//   4. COMMIT, e repete. Sem eventos, espera um pouco antes da próxima rodada.

console.log('[worker] ainda não implementado')
