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

## Versão corrigida — repetição com a mesma chave

- Data: 25/11/2026, às 22:28, horário de Brasília.
- Ambiente isolado: pixplus-etapa3.
- k6 v2.3.0.
- Três envios sequenciais do mesmo Pix de 100 centavos.
- Mesma Idempotency-Key nos três envios.
- Mesma transferência retornada: a2b758b8-e578-465d-8661-0edeb001269d.
- Saldo final da origem: 9900 centavos.
- Saldo final do destino: 10100 centavos.
- Extratos: exatamente um débito e um crédito para a transferência.
- 19 verificações aprovadas.
- Nenhuma falha HTTP nas 11 requisições do cenário completo.

A repetição sequencial foi validada. Este teste não avalia
requisições simultâneas com a mesma chave.

## Versão corrigida — Pix cruzado

- Data: 25/11/2026, às 22:30, horário de Brasília.
- Ambiente: pixplus-etapa3, com k6 v2.3.0.
- 1000 pares de envios A→B e B→A em paralelo.
- 2000 Pix concluídos.
- 3004 verificações aprovadas.
- Nenhuma falha HTTP ou iteração interrompida.
- Saldos iniciais e finais: 100000 centavos em cada conta.
- Nenhuma conta terminou negativa.
- p95 dos Pix: 49,96 ms.
- Taxa observada: 62,07 Pix concluídos/s.

Nenhum travamento foi observado nesta execução.
Os pares foram executados sequencialmente, com dois envios
em paralelo dentro de cada par.

## Versão corrigida — carga com 500 usuários

- Data: 25/11/2026, horário de Brasília.
- Ambiente isolado: pixplus-etapa3.
- k6 v2.3.0, 500 usuários virtuais e 20 contas exclusivas.
- Duração configurada: 30 segundos.
- 5022 operações completas, nenhuma interrompida.
- 3276 Pix concluídos.
- 1746 recusas por saldo insuficiente.
- Nenhuma resposta inesperada.
- 5022 verificações aprovadas.
- Taxa observada de conclusões: 98,56 Pix/s.
- p95 das operações: 3,74 s.
- Soma antes e depois: 420000 centavos.
- Nenhuma conta negativa antes ou depois.
- A consulta dos lançamentos do lote não encontrou transferências
  com quantidade diferente de um débito e um crédito.

## Comparação

| Indicador | v0-ingenua | Versão corrigida |
| --- | ---: | ---: |
| Usuários virtuais / contas da carga | 500 / 20 | 500 / 20 |
| Contas negativas antes → depois | 0 → 2 | 0 → 0 |
| Soma antes → depois, em centavos | 4230000 → 4230000 | 420000 → 420000 |
| Transferências com quantidade incorreta de lançamentos encontradas | 0 | 0 |
| Pix concluídos | 2811 | 3276 |
| Recusas por saldo insuficiente | 1390 | 1746 |
| Respostas inesperadas | 66721 | 0 |
| Pix concluídos/s | 88,03 | 98,56 |

As somas absolutas diferem porque os ambientes possuem conjuntos
diferentes de contas. Em cada execução, a soma foi preservada.

A comparação não isola desempenho: o nginx passou de 512 para
4096 conexões entre as execuções. A versão ingênua sofreu
saturação de conexões.

A repetição sequencial com a mesma chave e o cenário cruzado
também passaram, conforme as seções anteriores.

## Evidências da versão corrigida

- resultados-saldos-etapa3-antes.json
- resultados-saldos-etapa3-depois.json
- execucao-idempotencia-etapa3.log, mantido localmente
- execucao-pix-cruzado-etapa3.log, mantido localmente
- execucao-pix-etapa3.log, mantido localmente