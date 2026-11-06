# Medição de login e saldo

- Ambiente: local, serviços acessados pelo nginx
- Ferramenta: k6 v2.3.0 via Docker
- Usuários virtuais: 200
- Duração configurada: 30 segundos
- Pausa entre ciclos: 1 segundo
- Timeout por requisição: 30 segundos
- Iterações completas: 1002
- Iterações interrompidas: 0

## Resultados

- Requisições: 1996
- Vazão total: 54,43 requisições/s
- Falhas HTTP: 8 de 1996 (0,40%)
- Logins bem-sucedidos: 994 de 1002
- p95 de login: 6,38 s
- Consultas de saldo: 994, todas bem-sucedidas
- p95 de saldo: 12,07 ms
- Todas as consultas realizadas retornaram o saldo esperado: 10000 centavos

## Observações

A meta de zero falhas não foi atingida.

O nginx registrou oito ocorrências 499 em POST /auth/login,
indicando encerramento da conexão pelo cliente antes da resposta.
Os registros e os tempos próximos de 30 segundos são compatíveis
com timeout do k6. A causa da lentidão não foi determinada.

Este teste não realiza transferências nem valida concorrência financeira.