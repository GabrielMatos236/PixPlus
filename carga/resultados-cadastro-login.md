# Teste de cadastro e login

- Ferramenta: k6 v2.3.0, executado pelo Docker
- Ambiente: local, acesso pelo nginx
- Usuários virtuais simultâneos: 10
- Iterações completas: 100
- Cadastros: 100
- Logins: 100
- Verificações aprovadas: 300 de 300
- Falhas HTTP: 0 de 200
- Vazão: 20,08 requisições por segundo
- Tempo médio por requisição: 479,7 ms
- p95 das requisições: 1,46 s

Os tempos incluem as requisições de cadastro e login.
Este teste não mede saldo, transferências ou concorrência financeira.