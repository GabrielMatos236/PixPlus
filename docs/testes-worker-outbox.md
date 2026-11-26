# Testes manuais do worker da outbox

Ambiente local com Docker Compose e eventos fictícios.
Nenhuma transferência financeira foi executada.

## Entrega
Um evento válido foi processado sem falhas e gerou dois avisos:
um para o remetente e outro para o destinatário.

## Reentrega
O mesmo evento foi recolocado como pendente.
O worker processou novamente, mantendo apenas dois avisos.

## Indisponibilidade e recuperação
Com Notificações parado, o evento permaneceu pendente,
com incremento de tentativas e erro registrado.

Após reiniciar Notificações, o evento foi processado.
O contador manteve quatro falhas anteriores e foram criados dois avisos.

## Limite de tentativas
Um evento inválido foi inserido com nove falhas simuladas.
A tentativa seguinte recebeu HTTP 400 e deixou o evento com:
- status: erro
- tentativas: 10
- processado_em: vazio

## Duas réplicas ativas
Foram inseridos 100 eventos fictícios com duas réplicas do worker ativas.

Resultado:
- 100 eventos processados.
- Nenhuma falha de entrega no lote.
- 200 avisos criados.
- Cada evento gerou exatamente dois avisos.

Os logs mostraram que a réplica 2 processou os dois lotes de 50.
Este teste não comprovou divisão simultânea do trabalho entre as réplicas.

## Ainda não verificado
- Divisão simultânea do processamento entre réplicas.
- Entrega de eventos gerados por transferências reais.

## Queda de Notificações com 1000 Pix reais

- Data: 25/11/2026, horário de Brasília.
- Ambiente isolado: pixplus-etapa3.
- Duas contas exclusivas, inicialmente com 10000 centavos cada.
- Notificações foi parado antes da carga.
- 1000 Pix de 1 centavo, com dez usuários virtuais.
- Todos os Pix foram concluídos durante a indisponibilidade.
- Nenhuma falha HTTP ou iteração interrompida.
- p95 dos Pix: 95,63 ms.

Antes de religar Notificações, a outbox continha 1000 eventos pendentes.
Após a recuperação:
- 1000 transferências concluídas.
- 1000 eventos processados.
- 2000 avisos.
- Nenhum evento com avisos ausentes, extras ou atribuídos ao usuário errado.
- Cada evento tinha exatamente um aviso para a origem e um para o destino.

Evidências:
- carga/pix-queda-notificacoes.js
- carga/auditoria-queda-notificacoes.txt
- carga/execucao-queda-notificacoes.log, mantido localmente

O serviço foi religado no bloco finally ao término da carga.