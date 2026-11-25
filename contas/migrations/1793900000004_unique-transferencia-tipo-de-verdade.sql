-- Up Migration
-- A 1793900000003 usou "-- Up" / "-- Down" em vez de "-- Up Migration" /
-- "-- Down Migration". O node-pg-migrate não reconhece essas marcas e roda o
-- arquivo inteiro como "up": cria a constraint e apaga logo em seguida.
-- Resultado: ela aparece como aplicada, mas o UNIQUE não existe no banco.
-- Esta migration cria o UNIQUE de verdade (a 0003 fica como está, porque já
-- foi aplicada em todos os bancos).
ALTER TABLE lancamento
  ADD CONSTRAINT lancamento_transferencia_tipo_unico
  UNIQUE (transferencia_id, tipo);

-- Down Migration
ALTER TABLE lancamento
  DROP CONSTRAINT lancamento_transferencia_tipo_unico;
