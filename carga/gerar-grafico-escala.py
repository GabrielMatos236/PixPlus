"""Gera tabela, relatório e gráfico a partir dos resumos reais do k6.

Dependências: reportlab e pypdfium2.
"""

import csv
import json
import math
import tempfile
from pathlib import Path

import pypdfium2 as pdfium
from reportlab.graphics import renderPDF, renderSVG
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.shapes import Drawing, Rect, String
from reportlab.lib import colors


RAIZ = Path(__file__).resolve().parent
RESULTADOS = RAIZ / 'resultados-escala'


def ler_json(caminho):
    return json.loads(caminho.read_text(encoding='utf-8-sig'))


def carregar():
    linhas = []
    for replicas in (1, 2, 4):
        metricas = ler_json(RESULTADOS / f'escala-{replicas}.json')['metrics']
        antes = ler_json(RAIZ / f'resultados-saldos-escala-{replicas}-antes.json')
        depois = ler_json(RAIZ / f'resultados-saldos-escala-{replicas}-depois.json')
        vazao = metricas['escala_pix_concluidos']['rate']
        p95 = metricas['escala_tempo_pix']['p(95)']
        if not all(math.isfinite(v) and v > 0 for v in (vazao, p95)):
            raise ValueError(f'Métricas inválidas na configuração {replicas}')
        linhas.append({
            'replicas': replicas,
            'pix_concluidos': metricas['escala_pix_concluidos']['count'],
            'pix_por_segundo': vazao,
            'p95_ms': p95,
            'taxa_falhas_http': metricas['http_req_failed{operacao:pix_escala}']['value'],
            'checks_reprovados': metricas['checks']['fails'],
            'saldo_insuficiente': metricas['escala_saldo_insuficiente']['count'],
            'respostas_inesperadas': metricas['escala_respostas_inesperadas']['count'],
            'soma_antes_centavos': antes['soma_total'],
            'soma_depois_centavos': depois['soma_total'],
            'negativas_antes': antes['quantidade_contas_negativas'],
            'negativas_depois': depois['quantidade_contas_negativas'],
        })
    for linha in linhas:
        if (
            linha['pix_concluidos'] <= 0
            or linha['taxa_falhas_http'] != 0
            or linha['checks_reprovados'] != 0
            or linha['saldo_insuficiente'] != 0
            or linha['respostas_inesperadas'] != 0
            or linha['soma_antes_centavos'] != linha['soma_depois_centavos']
            or linha['negativas_antes'] != 0
            or linha['negativas_depois'] != 0
        ):
            raise ValueError(
                f"Execução {linha['replicas']} fora dos critérios de sucesso; "
                'analise os dados antes de gerar o relatório de aprovação.'
            )
    return linhas


def numero(valor, casas=2):
    return f'{valor:.{casas}f}'.replace('.', ',')


def grafico(linhas):
    desenho = Drawing(1100, 590)
    desenho.add(Rect(0, 0, 1100, 590, fillColor=colors.white, strokeColor=None))
    azul = colors.HexColor('#19354A')
    cinza = colors.HexColor('#526574')
    desenho.add(String(55, 545, 'Escala de Pix com 10.000 contas',
                       fontName='Helvetica-Bold', fontSize=25, fillColor=azul))
    desenho.add(String(55, 518, '500 usuários virtuais | 60 segundos | pool de 10 conexões por processo',
                       fontName='Helvetica', fontSize=13, fillColor=cinza))

    paineis = [
        (80, 'Vazão de Pix concluídos', 'Pix por segundo',
         [r['pix_por_segundo'] for r in linhas], 450, 100,
         colors.HexColor('#0F766E'), lambda v: numero(v)),
        (630, 'Latência p95 dos Pix', 'Segundos',
         [r['p95_ms'] / 1000 for r in linhas], 4, 1,
         colors.HexColor('#3A5E94'), lambda v: numero(v, 3)),
    ]
    for x, titulo, unidade, valores, limite, passo, cor, formato in paineis:
        desenho.add(String(x, 470, titulo, fontName='Helvetica-Bold',
                           fontSize=17, fillColor=azul))
        desenho.add(String(x, 446, unidade, fontName='Helvetica',
                           fontSize=11, fillColor=cinza))
        barras = VerticalBarChart()
        barras.x, barras.y = x, 150
        barras.width, barras.height = 390, 260
        barras.data = [valores]
        barras.categoryAxis.categoryNames = ['1 réplica', '2 réplicas', '4 réplicas']
        barras.categoryAxis.labels.fontName = 'Helvetica'
        barras.categoryAxis.labels.fontSize = 11
        barras.valueAxis.valueMin = 0
        barras.valueAxis.valueMax = limite
        barras.valueAxis.valueStep = passo
        barras.valueAxis.labels.fontName = 'Helvetica'
        barras.valueAxis.labels.fontSize = 10
        barras.valueAxis.visibleGrid = True
        barras.valueAxis.gridStrokeColor = colors.HexColor('#E2E8ED')
        barras.valueAxis.gridStrokeWidth = 0.5
        barras.bars[0].fillColor = cor
        barras.bars.strokeColor = None
        barras.barLabelFormat = formato
        barras.barLabels.fontName = 'Helvetica-Bold'
        barras.barLabels.fontSize = 12
        barras.barLabels.fillColor = azul
        barras.barLabels.nudge = 8
        barras.groupSpacing = 28
        desenho.add(barras)

    rodape = [
        'Réplicas de Contas, Transferências e worker variaram juntas; bancos, Auth, Notificações e nginx permaneceram únicos.',
        'Uma execução por configuração, na mesma máquina e na ordem 1, 2 e 4. A base não foi restaurada entre as medições.',
        'Todas as execuções: zero falhas HTTP, soma dos saldos preservada e nenhuma conta negativa nas coletas.',
    ]
    for i, texto in enumerate(rodape):
        desenho.add(String(55, 87 - i * 19, texto, fontName='Helvetica',
                           fontSize=10, fillColor=cinza))

    renderSVG.drawToFile(desenho, str(RESULTADOS / 'grafico-escala.svg'))
    with tempfile.TemporaryDirectory() as temporario:
        pdf = Path(temporario) / 'grafico.pdf'
        renderPDF.drawToFile(desenho, str(pdf))
        with pdfium.PdfDocument(str(pdf)) as documento:
            pagina = documento[0]
            bitmap = pagina.render(scale=2)
            bitmap.to_pil().save(RESULTADOS / 'grafico-escala.png')
            bitmap.close()
            pagina.close()


def relatorio(linhas):
    caminho_auditoria = RESULTADOS / 'auditoria-lancamentos.json'
    if caminho_auditoria.exists():
        auditoria = ler_json(caminho_auditoria)
        total_esperado = sum(r['pix_concluidos'] for r in linhas)
        if (
            auditoria['transferencias_auditadas'] != total_esperado
            or auditoria['transferencias_incorretas'] != 0
        ):
            raise ValueError('Auditoria incompatível com os resultados das cargas')
        secao_auditoria = f"""## Auditoria dos lançamentos
Uma consulta manual ao banco de Contas auditou as {total_esperado} transferências do lote das três execuções.
Nenhuma apresentou quantidade diferente de um débito e um crédito.
O total coincide com a soma dos Pix concluídos informados pelo k6.

Resultado transcrito da saída fornecida pelo usuário em `resultados-escala/auditoria-lancamentos.json`.
Consulta reproduzível em `auditar-lancamentos-escala.sql`, com parâmetro psql `lote={auditoria['lote']}`.
"""
    else:
        secao_auditoria = '## Auditoria dos lançamentos\nAinda não registrada para estas execuções.\n'
    tabela = '\n'.join(
        f"| {r['replicas']} | {r['pix_concluidos']} | {numero(r['pix_por_segundo'])} | "
        f"{numero(r['p95_ms'] / 1000, 3)} | {numero(r['taxa_falhas_http'] * 100)}% | "
        f"{r['soma_antes_centavos']} → {r['soma_depois_centavos']} | "
        f"{r['negativas_antes']} → {r['negativas_depois']} |"
        for r in linhas
    )
    ganho_2 = (linhas[1]['pix_por_segundo'] / linhas[0]['pix_por_segundo'] - 1) * 100
    ganho_4 = (linhas[2]['pix_por_segundo'] / linhas[0]['pix_por_segundo'] - 1) * 100
    texto = f"""# Medição de escala

## Configuração
- Ambiente local isolado: `pixplus-etapa3`.
- k6 v2.3.0, 500 usuários virtuais, 60 segundos e pausa de 100 ms entre operações.
- Mesmo lote de 10000 contas nas três medições, com depósito inicial de 10000 centavos por conta.
- Origem e destino escolhidos aleatoriamente no lote; valores de 1 a 100 centavos.
- Tokens obtidos antes da carga; duas consultas de preparação não entram na métrica de Pix.
- Contas, Transferências e worker variaram juntos: 1, 2 e 4 réplicas de cada serviço.
- `DB_POOL_MAX=10` por processo. A capacidade agregada dos pools aumenta com as réplicas.
- Auth, Notificações, nginx e cada banco permaneceram com uma instância.
- Coletas realizadas em 26/11/2026 UTC, correspondentes a 25/11/2026 no horário de Brasília.

## Resultados observados

| Réplicas por serviço | Pix concluídos | Pix/s | p95 (s) | Falhas HTTP dos Pix | Soma antes → depois (centavos) | Negativas antes → depois |
| --- | ---: | ---: | ---: | ---: | --- | --- |
{tabela}

![Vazão e p95 por número de réplicas](resultados-escala/grafico-escala.png)

A vazão observada aumentou {numero(ganho_2, 1)}% com duas réplicas e {numero(ganho_4, 1)}% com quatro, em relação a uma.
O crescimento não foi linear. Quatro réplicas deram a maior vazão, mas o p95 foi maior que nas outras duas configurações.
As três execuções tiveram zero verificações reprovadas, recusas por saldo insuficiente e respostas inesperadas.

{secao_auditoria}

## Limites da comparação
- Uma execução por configuração; não foram calculados intervalos de confiança.
- Ordem fixa: 1, 2 e 4 réplicas, na mesma máquina que executou o gerador de carga.
- A base foi reutilizada, sem restauração de saldos, lançamentos e tabelas de eventos entre as execuções.
- O estado da fila no início de cada configuração não está documentado nos arquivos de evidência desta entrega.
- As somas das coletas incluem todas as contas do ambiente, não apenas as 10000 do lote.
- A taxa é a fornecida pelo contador do k6, incluindo o período de finalização da execução.
- A auditoria dos lançamentos verifica as quantidades por transferência no lote. A repetição de uma chave e o Pix cruzado foram validados separadamente na etapa 3.
- O teste de queda de uma réplica durante a carga ainda não está incluído.

## Evidências e reprodução do gráfico
- Resumos originais: `resultados-escala/escala-1.json`, `escala-2.json` e `escala-4.json`.
- Coletas: `resultados-saldos-escala-{{1,2,4}}-{{antes,depois}}.json`.
- Tabela numérica: `resultados-escala/resumo.csv`.
- Gráficos: `resultados-escala/grafico-escala.png` e `.svg`.
- Logs completos `execucao-{{1,2,4}}.log` mantidos localmente.
- Gerador: `python carga/gerar-grafico-escala.py` (requer `reportlab` e `pypdfium2`).
- Dados do seed e tokens permanecem locais e ignorados pelo Git.
"""
    (RAIZ / 'resultados-escala.md').write_text(texto, encoding='utf-8')


def main():
    linhas = carregar()
    with (RESULTADOS / 'resumo.csv').open('w', encoding='utf-8', newline='') as arquivo:
        gravador = csv.DictWriter(arquivo, fieldnames=list(linhas[0]))
        gravador.writeheader()
        gravador.writerows(linhas)
    grafico(linhas)
    relatorio(linhas)
    print('Gráficos PNG/SVG, resumo CSV e relatório gerados dos três JSONs do k6.')


if __name__ == '__main__':
    main()
