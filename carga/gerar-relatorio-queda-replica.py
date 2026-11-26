"""Gera relatório e gráfico do teste de queda. Requer reportlab e pypdfium2."""

import csv
import json
import tempfile
from datetime import datetime
from pathlib import Path

import pypdfium2 as pdfium
from reportlab.graphics import renderPDF, renderSVG
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.shapes import Drawing, Rect, String
from reportlab.lib import colors


RAIZ = Path(__file__).resolve().parent
SAIDA = RAIZ / 'resultados-queda-replica' / 'execucao-1'


def ler(caminho):
    return json.loads(caminho.read_text(encoding='utf-8-sig'))


def numero(valor, casas=2):
    return f'{valor:.{casas}f}'.replace('.', ',')


def instante(valor):
    return datetime.fromisoformat(valor.replace('Z', '+00:00'))


def desenhar(linhas):
    desenho = Drawing(1100, 590)
    azul = colors.HexColor('#19354A')
    cinza = colors.HexColor('#526574')
    desenho.add(Rect(0, 0, 1100, 590, fillColor=colors.white, strokeColor=None))
    desenho.add(String(55, 545, 'Queda de uma réplica durante a carga',
                       fontName='Helvetica-Bold', fontSize=25, fillColor=azul))
    desenho.add(String(55, 518, '500 usuários virtuais | 10.000 contas | 60 segundos | pool de 10 por processo',
                       fontName='Helvetica', fontSize=13, fillColor=cinza))
    for x, titulo, unidade, valores, limite, passo, formato in [
        (80, 'Pix confirmados ao cliente', 'Pix por segundo',
         [r['pix_por_segundo'] for r in linhas], 450, 100,
         lambda v: numero(v)),
        (630, 'Falhas observadas pelo cliente', 'Percentual das operações de Pix',
         [r['falhas_percentual'] for r in linhas], 2.5, 0.5,
         lambda v: numero(v) + '%'),
    ]:
        desenho.add(String(x, 470, titulo, fontName='Helvetica-Bold',
                           fontSize=17, fillColor=azul))
        desenho.add(String(x, 446, unidade, fontName='Helvetica',
                           fontSize=11, fillColor=cinza))
        barras = VerticalBarChart()
        barras.x, barras.y = x, 150
        barras.width, barras.height = 390, 260
        barras.data = [valores]
        barras.categoryAxis.categoryNames = ['Sem queda', 'Com queda']
        barras.categoryAxis.labels.fontName = 'Helvetica'
        barras.categoryAxis.labels.fontSize = 12
        barras.valueAxis.valueMin = 0
        barras.valueAxis.valueMax = limite
        barras.valueAxis.valueStep = passo
        barras.valueAxis.labels.fontSize = 10
        barras.valueAxis.visibleGrid = True
        barras.valueAxis.gridStrokeColor = colors.HexColor('#E2E8ED')
        barras.valueAxis.gridStrokeWidth = 0.5
        barras.bars[0].fillColor = colors.HexColor('#0F766E')
        barras.bars[(0, 1)].fillColor = colors.HexColor('#AD4D36')
        barras.bars.strokeColor = None
        barras.barLabelFormat = formato
        barras.barLabels.fontName = 'Helvetica-Bold'
        barras.barLabels.fontSize = 12
        barras.barLabels.fillColor = azul
        barras.barLabels.nudge = 8
        barras.groupSpacing = 40
        desenho.add(barras)
    for i, texto in enumerate([
        'Teste com queda: Transferências passou de 4 para 3 réplicas; Contas e worker permaneceram com 4.',
        'Queda solicitada 30 s após observar a primeira transferência. A réplica foi restaurada depois da carga.',
        'Uma execução por condição, na mesma máquina. Timeout não implica ausência de movimentação no banco.',
    ]):
        desenho.add(String(55, 87 - 19 * i, texto, fontName='Helvetica',
                           fontSize=10, fillColor=cinza))
    renderSVG.drawToFile(desenho, str(SAIDA / 'grafico-queda-replica.svg'))
    with tempfile.TemporaryDirectory() as temporario:
        caminho = Path(temporario) / 'grafico.pdf'
        renderPDF.drawToFile(desenho, str(caminho))
        with pdfium.PdfDocument(str(caminho)) as documento:
            pagina = documento[0]
            bitmap = pagina.render(scale=2)
            bitmap.to_pil().save(SAIDA / 'grafico-queda-replica.png')
            bitmap.close()
            pagina.close()


def main():
    meta = ler(SAIDA / 'metadados.json')
    auditoria = ler(SAIDA / 'auditoria.json')
    antes = ler(SAIDA / 'saldos-antes.json')
    depois = ler(SAIDA / 'saldos-depois.json')
    metricas = ler(SAIDA / 'resumo-k6.json')['metrics']
    base = ler(RAIZ / 'resultados-escala' / 'escala-4.json')['metrics']
    if not (meta['queda_confirmada'] and meta['restauracao_confirmada']):
        raise ValueError('Queda ou restauração não confirmada')
    if not (
        instante(meta['inicio_comando_carga_utc']) < instante(meta['container_finalizado_utc'])
        < instante(meta['fim_comando_carga_utc']) < instante(meta['restauracao_verificada_utc'])
    ):
        raise ValueError('Sequência de horários inconsistente')
    if (
        auditoria['transferencias_auditadas'] != auditoria['transferencias_concluidas_banco']
        or auditoria['transferencias_incorretas'] != 0
        or auditoria['criadas_e_concluidas_durante_a_queda'] <= 0
        or antes['soma_total'] != depois['soma_total']
        or antes['quantidade_contas_negativas'] != 0
        or depois['quantidade_contas_negativas'] != 0
    ):
        raise ValueError('Auditoria financeira inconsistente')

    linhas = []
    for nome, dados in [('Sem queda', base), ('Com queda', metricas)]:
        linhas.append({
            'condicao': nome,
            'operacoes_pix': dados['http_reqs{operacao:pix_escala}']['count'],
            'pix_confirmados_cliente': dados['escala_pix_concluidos']['count'],
            'pix_por_segundo': dados['escala_pix_concluidos']['rate'],
            'p95_ms': dados['escala_tempo_pix']['p(95)'],
            'falhas_cliente': dados['escala_respostas_inesperadas']['count'],
            'falhas_percentual': dados['http_req_failed{operacao:pix_escala}']['value'] * 100,
        })
    atual = linhas[1]
    diferenca = auditoria['transferencias_concluidas_banco'] - atual['pix_confirmados_cliente']
    if diferenca < 0 or atual['operacoes_pix'] != atual['pix_confirmados_cliente'] + atual['falhas_cliente']:
        raise ValueError('Contagens do cliente e do banco incompatíveis')

    log = (SAIDA / 'execucao.log').read_text(encoding='utf-8-sig')
    avisos_timeout = sum('Request Failed' in s and 'request timeout' in s for s in log.splitlines())
    with (SAIDA / 'comparacao.csv').open('w', encoding='utf-8', newline='') as arquivo:
        gravador = csv.DictWriter(arquivo, fieldnames=list(linhas[0]))
        gravador.writeheader()
        gravador.writerows(linhas)
    desenhar(linhas)

    tabela = '\n'.join(
        f"| {r['condicao']} | {r['operacoes_pix']} | {r['pix_confirmados_cliente']} | "
        f"{numero(r['pix_por_segundo'])} | {numero(r['p95_ms'] / 1000, 3)} | "
        f"{r['falhas_cliente']} | {numero(r['falhas_percentual'])}% |"
        for r in linhas
    )
    texto = f"""# Queda de uma réplica durante a carga

## Procedimento
- Execução em 26/11/2026, horário de Brasília; horários técnicos preservados em UTC.
- Projeto isolado `{meta['projeto']}`, revisão `{meta['revisao']}`.
- k6 v2.3.0, 500 usuários virtuais, 10000 contas e 60 segundos de carga configurada.
- Mesmo `escala.js` e lote da medição de escala; valores de 1 a 100 centavos, pausa de 100 ms e sem reenvio automático pelo cliente.
- Quatro réplicas iniciais de Contas, Transferências e worker, pool de 10 por processo.
- Alvo: `{meta['alvo_nome']}`. O script valida projeto, serviço e identificador antes de agir.
- O script observa a primeira nova transferência do lote e aguarda 30 segundos para solicitar `SIGKILL`.
- Somente Transferências passou de quatro para três réplicas. Bancos, Auth, Notificações e nginx permaneceram únicos.

## Cronologia UTC
- Comando de carga iniciado: `{meta['inicio_comando_carga_utc']}`.
- Primeira transferência observada: `{meta['primeira_transferencia_observada_utc']}`.
- Container finalizado: `{meta['container_finalizado_utc']}`, código {meta['codigo_saida_container']}.
- Comando de carga finalizado: `{meta['fim_comando_carga_utc']}`.
- Restauração saudável verificada: `{meta['restauracao_verificada_utc']}`.
- A réplica foi religada no bloco `finally`.

## Resultado observado pelo cliente

| Condição | Operações de Pix | Confirmações de sucesso | Pix confirmados/s | p95 (s) | Falhas | Taxa de falha |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
{tabela}

![Vazão e taxa de falha](resultados-queda-replica/execucao-1/grafico-queda-replica.png)

O serviço continuou atendendo, com degradação: {numero(atual['falhas_percentual'])}% das operações falharam na perspectiva do cliente.
O código de saída do k6 foi {meta['codigo_k6']}, pois os thresholds herdados do cenário exigem zero falhas.
Isso não equivale a erro de execução do controlador, nem a validação de disponibilidade sem falhas.
O log contém {avisos_timeout} linhas de aviso de timeout. Não há discriminação completa dos demais erros no resumo agregado.

## Reconciliação e integridade
- Banco: {auditoria['transferencias_concluidas_banco']} transferências concluídas do lote desde o início do comando.
- {auditoria['criadas_e_concluidas_durante_a_queda']} foram criadas e marcadas como concluídas entre a queda e o fim da carga, antes da restauração.
- Há {diferenca} conclusões adicionais no banco em relação às confirmações do cliente.
- Não foi registrada correlação individual entre cada resposta perdida e sua chave; não é possível atribuir nominalmente essas conclusões aos timeouts.
- A auditoria dos {auditoria['transferencias_auditadas']} identificadores encontrou zero transferências com quantidade diferente de um débito e um crédito.
- Soma antes e depois: {antes['soma_total']} centavos; nenhuma conta negativa nas duas coletas.
- Resultados SQL transcritos da saída fornecida pelo usuário em `auditoria.json`.

## Limitações
- Uma execução por condição, em ambiente local com gerador e serviços na mesma máquina.
- Base reutilizada após as três medições de escala, sem restauração dos dados.
- A comparação de vazão e p95 é descritiva; não isola o efeito da queda nem garante escala ou disponibilidade em produção.
- A taxa de falha é global para toda a execução, não apenas para o intervalo com três réplicas.
- O p95 inclui falhas; um p95 menor com queda não demonstra melhoria de experiência ou confiabilidade.
- As consultas de auditoria usam o lote e o início temporal do teste; não executar outra carga com esse lote antes de repetir a auditoria.
- O teste não valida uma indisponibilidade longa nem queda do banco.

## Evidências e reprodução
- Controlador: `testar-queda-replica.ps1`.
- Consultas: `auditar-queda-replica-transferencias.sql` e `auditar-queda-replica-lancamentos.sql`.
- Pasta: `resultados-queda-replica/execucao-1/`, com metadados, resumo k6, saldos, auditoria, CSV e gráficos PNG/SVG.
- `execucao.log` permanece local e ignorado pelo Git.
- Para gerar novamente relatório e gráfico: `python carga/gerar-relatorio-queda-replica.py`, com `reportlab` e `pypdfium2`.
- O controlador recusa sobrescrever uma execução existente. Os tokens e senhas do seed permanecem locais e ignorados pelo Git.
"""
    (RAIZ / 'resultados-queda-replica.md').write_text(texto, encoding='utf-8')
    print('Relatório, CSV e gráficos gerados. Nenhuma nova carga foi executada.')


if __name__ == '__main__':
    main()
