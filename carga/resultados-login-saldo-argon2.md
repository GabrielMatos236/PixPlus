# Login e saldo após ajuste do Argon2

## Configuração
- k6 v2.3.0 via Docker.
- 200 usuários virtuais durante 30 segundos.
- Pausa de 1 segundo entre ciclos.
- Timeout de 30 segundos por requisição.
- Novo lote de 200 usuários, com depósito de 10000 centavos por conta.

## Resultado
- 2197 iterações completas, nenhuma interrompida.
- 4394 requisições, nenhuma falha HTTP.
- 8788 verificações aprovadas.
- Todas as consultas de saldo retornaram o valor esperado.
- Vazão total: 134,33 requisições/s.
- p95 de login: 2,24 s.
- p95 de saldo: 10,82 ms.

## Comparação com a medição original
- p95 de login: de 6,38 s para 2,24 s, redução aproximada de 65%.
- Vazão total: de 54,43 para 134,33 requisições/s.
- Falhas HTTP: de 8 para 0.

## Limitações
Uma execução intermediária reutilizou usuários com hashes antigos
(m=65536,p=4,t=3). Ela apresentou p95 de login de 8,16 s,
vazão de 44,41 requisições/s e quatro falhas HTTP.

Foi necessário cadastrar novos usuários para aplicar os parâmetros
atuais de criação de hashes: m=19456,p=1,t=2.

As medições foram feitas em momentos diferentes no ambiente local;
a comparação não isola todas as possíveis variações da máquina.