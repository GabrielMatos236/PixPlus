-- Up Migration
-- Caixa de saída dos eventos. Transferências grava aqui, na mesma transação que
-- muda o status da transferência. O worker (src/worker) lê e entrega em Notificações.
-- Regras completas em docs/contratos.md, seção "Eventos (outbox)".
CREATE TYPE status_evento AS ENUM ('pendente', 'processado', 'erro');

CREATE TABLE outbox (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(), -- é o id do evento
  tipo          TEXT          NOT NULL,                              -- ex.: 'transferencia.concluida'
  dados         JSONB         NOT NULL,
  status        status_evento NOT NULL DEFAULT 'pendente',
  tentativas    INTEGER       NOT NULL DEFAULT 0 CHECK (tentativas >= 0),
  -- Antes desse horário o worker não pega o evento. Cada falha empurra para mais
  -- longe (espera crescente), para Notificações fora do ar não gastar as 10 tentativas
  -- em poucos segundos.
  disponivel_em TIMESTAMPTZ   NOT NULL DEFAULT now(),
  ultimo_erro   TEXT,
  criado_em     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  processado_em TIMESTAMPTZ,

  CONSTRAINT outbox_processado_tem_data CHECK ((status = 'processado') = (processado_em IS NOT NULL))
);

-- O worker só procura pendentes já disponíveis; os processados nunca entram no índice.
CREATE INDEX idx_outbox_pendentes ON outbox (disponivel_em) WHERE status = 'pendente';

-- Down Migration
DROP TABLE outbox;
DROP TYPE status_evento;
