-- Up Migration
ALTER TABLE conta ADD COLUMN encerrada_em TIMESTAMPTZ DEFAULT NULL;

-- Down Migration
ALTER TABLE conta DROP COLUMN encerrada_em;