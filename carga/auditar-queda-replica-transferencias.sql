SELECT status,
       count(*) AS transferencias,
       count(*) FILTER (
         WHERE criada_em >= :'queda'::timestamptz
           AND criada_em <= :'fim'::timestamptz
       ) AS criadas_durante_a_queda
FROM transferencia
WHERE chave_destino LIKE 'seed.' || :'lote' || '.%@teste.example'
  AND criada_em >= :'inicio'::timestamptz
GROUP BY status;

SELECT count(*) AS criadas_e_concluidas_durante_a_queda
FROM transferencia
WHERE chave_destino LIKE 'seed.' || :'lote' || '.%@teste.example'
  AND status = 'concluida'
  AND criada_em >= :'queda'::timestamptz
  AND atualizada_em >= :'queda'::timestamptz
  AND atualizada_em <= :'fim'::timestamptz;
