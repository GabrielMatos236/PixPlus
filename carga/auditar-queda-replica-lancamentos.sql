WITH contagem AS (
  SELECT l.transferencia_id,
         count(*) FILTER (WHERE l.tipo = 'debito') AS debitos,
         count(*) FILTER (WHERE l.tipo = 'credito') AS creditos
  FROM lancamento l
  JOIN conta c ON c.id = l.conta_id
  WHERE l.transferencia_id IS NOT NULL
    AND l.criado_em >= :'inicio'::timestamptz
    AND c.chave_pix LIKE 'seed.' || :'lote' || '.%@teste.example'
  GROUP BY l.transferencia_id
)
SELECT count(*) AS transferencias_auditadas,
       count(*) FILTER (
         WHERE debitos <> 1 OR creditos <> 1
       ) AS transferencias_incorretas
FROM contagem;
