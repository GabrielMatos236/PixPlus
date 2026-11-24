-- Up
ALTER TABLE lancamento
  ADD CONSTRAINT lancamento_transferencia_tipo_unico
  UNIQUE (transferencia_id, tipo);

-- Down
ALTER TABLE lancamento
  DROP CONSTRAINT lancamento_transferencia_tipo_unico;