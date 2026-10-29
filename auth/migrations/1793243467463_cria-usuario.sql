-- Up Migration

CREATE TABLE usuario (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT        NOT NULL CHECK (char_length(nome) BETWEEN 2 AND 100),
  email      TEXT        NOT NULL UNIQUE CHECK (email = lower(email)),
  cpf        CHAR(11)    NOT NULL UNIQUE CHECK (cpf ~ '^[0-9]{11}$'),
  senha_hash TEXT        NOT NULL,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Down Migration

DROP TABLE usuario;
