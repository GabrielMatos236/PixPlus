-- Up Migration

-- Quem entra pelo Firebase (e-mail e senha do Firebase, ou Google) não tem senha aqui:
-- a senha fica no Firebase. O que liga a pessoa ao nosso usuário é o uid do Firebase.
ALTER TABLE usuario
  ADD COLUMN firebase_uid TEXT UNIQUE CHECK (char_length(firebase_uid) BETWEEN 1 AND 128);

ALTER TABLE usuario ALTER COLUMN senha_hash DROP NOT NULL;

-- Todo usuário precisa de pelo menos um jeito de entrar: senha nossa ou conta do Firebase.
ALTER TABLE usuario
  ADD CONSTRAINT usuario_tem_como_entrar CHECK (senha_hash IS NOT NULL OR firebase_uid IS NOT NULL);

-- Down Migration

-- Quem só tem conta do Firebase não cabe na tabela antiga (senha_hash obrigatória).
DELETE FROM usuario WHERE senha_hash IS NULL;
ALTER TABLE usuario DROP CONSTRAINT usuario_tem_como_entrar;
ALTER TABLE usuario ALTER COLUMN senha_hash SET NOT NULL;
ALTER TABLE usuario DROP COLUMN firebase_uid;
