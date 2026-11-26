-- Up Migration
-- Quem encerra a conta pode abrir outra. A regra continua "uma conta por usuário",
-- mas agora vale só para conta ativa: o UNIQUE passa a ignorar as encerradas.
-- O índice novo mantém o nome conta_usuario_unico, que é o que a rota POST /contas
-- confere para responder 409 "você já tem uma conta".
ALTER TABLE conta DROP CONSTRAINT conta_usuario_unico;
CREATE UNIQUE INDEX conta_usuario_unico ON conta (usuario_id) WHERE encerrada_em IS NULL;

-- Mesma coisa para a chave pix: a chave de uma conta encerrada fica livre de novo.
-- As buscas por chave já filtram encerrada_em IS NULL.
ALTER TABLE conta DROP CONSTRAINT conta_chave_pix_key;
CREATE UNIQUE INDEX conta_chave_pix_ativa ON conta (chave_pix) WHERE encerrada_em IS NULL;

-- Down Migration
DROP INDEX conta_chave_pix_ativa;
ALTER TABLE conta ADD CONSTRAINT conta_chave_pix_key UNIQUE (chave_pix);
DROP INDEX conta_usuario_unico;
ALTER TABLE conta ADD CONSTRAINT conta_usuario_unico UNIQUE (usuario_id);