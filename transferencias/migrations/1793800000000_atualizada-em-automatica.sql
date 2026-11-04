-- Up Migration
-- Todo UPDATE em transferencia passa a gravar atualizada_em = now() sozinho.
-- A rotina de pendentes (etapa 3) usa essa coluna para achar transferências
-- "paradas há mais de 1 minuto"; se algum UPDATE esquecesse de atualizá-la,
-- a rotina reprocessaria uma transferência que acabou de mudar.
-- Fica no banco, e não no código, para nenhum UPDATE escapar.
CREATE FUNCTION marcar_atualizada_em() RETURNS trigger AS $$
BEGIN
  NEW.atualizada_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER transferencia_atualizada_em
  BEFORE UPDATE ON transferencia
  FOR EACH ROW EXECUTE FUNCTION marcar_atualizada_em();

-- Down Migration
DROP TRIGGER transferencia_atualizada_em ON transferencia;
DROP FUNCTION marcar_atualizada_em();
