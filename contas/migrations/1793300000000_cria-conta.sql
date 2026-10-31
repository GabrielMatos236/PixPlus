-- Up Migration
CREATE TABLE conta (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  UUID        NOT NULL,
  chave_pix   TEXT        NOT NULL UNIQUE,
  criada_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conta_usuario ON conta (usuario_id);

-- Down Migration
DROP INDEX idx_conta_usuario;
DROP TABLE conta;