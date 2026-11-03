-- Up Migration
CREATE TYPE status_transferencia AS ENUM ('pendente', 'concluida', 'falhou');

CREATE TABLE transferencia (
  id                 UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Gerada pelo cliente (cabeçalho Idempotency-Key). Única por usuário: duas pessoas
  -- podem usar a mesma chave sem uma esbarrar na transferência da outra.
  chave_idempotencia TEXT                 NOT NULL,
  usuario_origem     UUID                 NOT NULL, -- quem enviou: só ele pode consultar
  conta_origem       UUID                 NOT NULL,
  -- Guardados na criação porque a rotina de pendentes (etapa 3) precisa gravar
  -- o evento da outbox sem voltar a consultar Contas.
  usuario_destino    UUID                 NOT NULL,
  conta_destino      UUID                 NOT NULL,
  chave_destino      TEXT                 NOT NULL,
  valor              INTEGER              NOT NULL CHECK (valor > 0), -- centavos
  status             status_transferencia NOT NULL DEFAULT 'pendente',
  motivo_falha       TEXT, -- ex.: 'saldo insuficiente'; repetir a requisição devolve o mesmo erro
  criada_em          TIMESTAMPTZ          NOT NULL DEFAULT now(),
  atualizada_em      TIMESTAMPTZ          NOT NULL DEFAULT now(),

  CONSTRAINT transferencia_origem_diferente_destino CHECK (conta_origem <> conta_destino),
  CONSTRAINT transferencia_idempotencia_unica UNIQUE (usuario_origem, chave_idempotencia),
  CONSTRAINT transferencia_falha_tem_motivo CHECK ((status = 'falhou') = (motivo_falha IS NOT NULL))
);

-- A rotina de pendentes só olha as que estão paradas: o índice parcial ignora o resto.
CREATE INDEX idx_transferencia_pendentes ON transferencia (atualizada_em) WHERE status = 'pendente';

-- Down Migration
DROP TABLE transferencia;
DROP TYPE status_transferencia;
