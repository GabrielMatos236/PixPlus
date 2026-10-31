-- Up Migration
CREATE TYPE tipo_lancamento AS ENUM ('debito', 'credito');

CREATE TABLE lancamento (
  id               UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id         UUID             NOT NULL REFERENCES conta(id),
  tipo             tipo_lancamento  NOT NULL,
  valor            INTEGER          NOT NULL CHECK (valor > 0),
  transferencia_id UUID,
  criado_em        TIMESTAMPTZ      NOT NULL DEFAULT now()
);

CREATE INDEX idx_lancamento_conta_data ON lancamento (conta_id, criado_em DESC);

-- Down Migration
DROP TABLE lancamento;
DROP TYPE tipo_lancamento;