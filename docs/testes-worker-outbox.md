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