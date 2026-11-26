WITH inseridos AS (
  INSERT INTO outbox (tipo, dados)
  SELECT
    'transferencia.concluida',
    jsonb_build_object(
      'transferencia_id', gen_random_uuid(),
      'usuario_origem', :'origem'::uuid,
      'usuario_destino', :'destino'::uuid,
      'chave_destino', 'workers-' || :'lote' || '@teste.example',
      'valor', 100,
      'concluida_em', now()
    )
  FROM generate_series(1, 10000)
  WHERE NOT EXISTS (
    SELECT 1
    FROM outbox
    WHERE dados->>'chave_destino'
      = 'workers-' || :'lote' || '@teste.example'
  )
  RETURNING id
)
SELECT count(*) AS eventos_criados
FROM inseridos;

SELECT status, count(*) AS eventos
FROM outbox
WHERE dados->>'chave_destino'
  = 'workers-' || :'lote' || '@teste.example'
GROUP BY status;