-- Up Migration
CREATE TABLE evento_recebido (
  id          UUID        PRIMARY KEY,
  recebido_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notificacao (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id  UUID        NOT NULL REFERENCES evento_recebido(id),
  usuario_id UUID        NOT NULL,
  mensagem   TEXT        NOT NULL,
  lida       BOOLEAN     NOT NULL DEFAULT false,
  criada_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notificacao_usuario_data
  ON notificacao (usuario_id, criada_em DESC, id DESC);

-- Down Migration
DROP TABLE notificacao;
DROP TABLE evento_recebido;