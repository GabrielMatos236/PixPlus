Em docs/contratos.md, na seção "POST /transferencias", troque esta linha:

- **Ainda falta (etapa 3):** novas tentativas na chamada a Contas e a rotina de pendentes. Até lá, uma transferência que ficou `pendente` continua pendente

por estas três:

- Novas tentativas: cada chamada a Contas tem limite de 2 s e até 3 tentativas quando Contas não responde (fora do ar, timeout ou 5xx), com espera de 200 ms e depois 400 ms. Só depois da 3ª falha vem o 503
- Rotina de pendentes: a cada minuto, cada réplica de Transferências pega até 50 transferências `pendente` paradas há mais de 1 minuto (`FOR UPDATE SKIP LOCKED`, então duas réplicas nunca pegam a mesma) e chama a movimentação de novo com o mesmo `transferencia_id`. Contas confirmou → `concluida` e o evento vai para a outbox; Contas recusou → `falhou` com o motivo; Contas ainda fora do ar → continua `pendente` e volta 1 minuto depois
- O que Transferências espera de `POST /interno/movimentacoes` ao repetir um `transferencia_id` que já foi lançado: 200 ou 201, sem lançar de novo. Por isso as novas tentativas e a rotina só podem entrar depois que a movimentação de Contas for idempotente
