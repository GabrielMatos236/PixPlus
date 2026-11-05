-- Up Migration
-- Uma conta por usuário (como no Nubank) e chave pix sempre normalizada.
-- Se o banco de desenvolvimento já tiver duas contas do mesmo usuário, ou duas
-- chaves que só diferem em maiúsculas/espaços, esta migration falha de propósito.
-- Nesse caso, apague os dados de teste: docker compose down -v

-- Chaves antigas passam para o formato que a API grava agora.
UPDATE conta SET chave_pix = lower(btrim(chave_pix)) WHERE chave_pix <> lower(btrim(chave_pix));

-- O UNIQUE já cria um índice em usuario_id; o índice antigo vira repetido.
DROP INDEX idx_conta_usuario;
ALTER TABLE conta ADD CONSTRAINT conta_usuario_unico UNIQUE (usuario_id);

-- Mesmo que algum código esqueça de normalizar, o banco não aceita chave fora do padrão.
ALTER TABLE conta ADD CONSTRAINT conta_chave_normalizada
  CHECK (chave_pix = lower(btrim(chave_pix)) AND chave_pix <> '');

-- Down Migration
ALTER TABLE conta DROP CONSTRAINT conta_chave_normalizada;
ALTER TABLE conta DROP CONSTRAINT conta_usuario_unico;
CREATE INDEX idx_conta_usuario ON conta (usuario_id);
