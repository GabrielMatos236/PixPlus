# Teste de Pix — versão ingênua

## Configuração
- Data: 19/11/2026.
- Ambiente local com Docker Compose.
- k6 v2.3.0 na rede pixplus_default, acessando o nginx.
- 500 usuários virtuais compartilhando 20 contas.
- Duração configurada: 30 segundos.
- Valores aleatórios de 1 a 10000 centavos.
- Pausa de 100 ms entre operações.
- Sem reenvio automático.

## Resultado financeiro

| Indicador | Antes | Depois |
| --- | ---: | ---: |
| Soma dos saldos, em centavos | 4230000 | 4230000 |
| Contas negativas | 0 | 2 |

Saldos negativos encontrados no lote:
- Conta com chave terminada em .6@teste.example: -513 centavos.
- Conta com chave terminada em .4@teste.example: -7772 centavos.

A versão ingênua permitiu gastos simultâneos acima do saldo disponível,
mesmo preservando a soma total dos saldos.

A consulta dos lançamentos das 20 contas não encontrou transferências
com quantidade diferente de um débito e um crédito.
Isso não valida reenvios com a mesma chave de idempotência.

## Resultado da carga
- 70922 tentativas de Pix.
- 2811 Pix concluídos.
- 1390 recusas por saldo insuficiente.
- 66721 respostas inesperadas.
- Nenhuma iteração interrompida.
- Taxa observada de Pix concluídos: 88,03 por segundo.
- p95 de tempo_pix: 1,66 s, incluindo respostas inesperadas.

## Limitação de infraestrutura
O nginx registrou:
512 worker_connections are not enough while connecting to upstream

O limite de conexões foi atingido durante a carga.
A execução demonstra contas negativas, mas não deve ser usada
isoladamente como referência de desempenho.

Os thresholds de respostas esperadas não foram atingidos.

## Evidências
- resultados-saldos-antes.json
- resultados-saldos-depois.json
- execucao-pix-ingenua.log, mantido localmente

## Próxima comparação
Após as correções de concorrência e idempotência de B e C,
repetir o cenário com novas contas e condições equivalentes,
registrando também qualquer ajuste de infraestrutura.