param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^usuarios-seed-[0-9]+\.json$')]
    [string]$ArquivoUsuarios,

    [ValidatePattern('^[a-z0-9][a-z0-9-]*$')]
    [string]$Projeto = 'pixplus-etapa3',

    [ValidatePattern('^[a-z0-9][a-z0-9-]*$')]
    [string]$Execucao = 'execucao-1'
)

$ErrorActionPreference = 'Stop'
$raizProjeto = Split-Path -Parent $PSScriptRoot
$pastaResultado = Join-Path $PSScriptRoot "resultados-queda-replica\$Execucao"
$arquivoMetadados = Join-Path $pastaResultado 'metadados.json'
$nomeCarga = "$Projeto-carga-queda-$Execucao"
$lote = [regex]::Match($ArquivoUsuarios, '[0-9]+').Value
$trabalho = $null
$alvo = $null
$metadados = [ordered]@{}

function Ler-Container([string]$Identificador) {
    $texto = @(& docker inspect $Identificador 2>$null)
    if ($LASTEXITCODE -ne 0) {
        throw "Nao foi possivel consultar o container $Identificador"
    }
    return @(($texto -join "`n") | ConvertFrom-Json)[0]
}

function Salvar-Metadados {
    [System.IO.File]::WriteAllText(
        $arquivoMetadados,
        ($metadados | ConvertTo-Json -Depth 8) + "`n",
        [System.Text.UTF8Encoding]::new($false)
    )
}

function Coletar-Saldos([string]$Momento) {
    $texto = Get-Content -Raw -Encoding UTF8 (Join-Path $PSScriptRoot 'verificar-saldos.mjs') |
        & docker compose -p $Projeto exec -T contas node --input-type=module
    if ($LASTEXITCODE -ne 0) {
        throw "Falha na coleta de saldos: $Momento"
    }
    $dados = ($texto -join "`n") | ConvertFrom-Json
    [System.IO.File]::WriteAllText(
        (Join-Path $pastaResultado "saldos-$Momento.json"),
        ($dados | ConvertTo-Json -Depth 10) + "`n",
        [System.Text.UTF8Encoding]::new($false)
    )
}

Push-Location $raizProjeto

try {
    if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $ArquivoUsuarios))) {
        throw 'Arquivo de usuarios nao encontrado'
    }
    if (Test-Path -LiteralPath $pastaResultado) {
        throw 'Esta execucao ja possui resultados. Preserve-os e analise antes de repetir.'
    }

    $replicas = @()
    foreach ($servico in @('contas', 'transferencias', 'worker-outbox')) {
        $identificadores = @(& docker compose -p $Projeto ps -q $servico)
        if ($LASTEXITCODE -ne 0 -or $identificadores.Count -ne 4) {
            throw "O teste exige quatro replicas em execucao de $servico"
        }
        foreach ($identificador in $identificadores) {
            $container = Ler-Container $identificador
            if (
                -not $container.State.Running -or
                $container.Config.Labels.'com.docker.compose.project' -ne $Projeto -or
                $container.Config.Labels.'com.docker.compose.service' -ne $servico -or
                -not ($container.Config.Env -contains 'DB_POOL_MAX=10')
            ) {
                throw "Estado, projeto ou pool inesperado em $servico"
            }
            if ($container.State.Health -and $container.State.Health.Status -ne 'healthy') {
                throw "Replica de $servico ainda nao esta saudavel"
            }
            $replicas += [PSCustomObject]@{
                servico = $servico
                nome = $container.Name.TrimStart('/')
                id = $container.Id
                imagem = $container.Image
                pool = 10
            }
            if (
                $servico -eq 'transferencias' -and
                $container.Config.Labels.'com.docker.compose.container-number' -eq '4'
            ) {
                $alvo = $container
            }
        }
    }
    if (-not $alvo) {
        throw 'Replica 4 de Transferencias nao encontrada; nenhum container sera derrubado'
    }

    $null = New-Item -ItemType Directory -Path $pastaResultado
    $metadados = [ordered]@{
        projeto = $Projeto
        execucao = $Execucao
        arquivo_usuarios = $ArquivoUsuarios
        lote = $lote
        revisao = (& git rev-parse HEAD)
        alvo_nome = $alvo.Name.TrimStart('/')
        alvo_id = $alvo.Id
        replicas_iniciais = $replicas
        vus = 500
        duracao_configurada_segundos = 60
        atraso_apos_primeira_transferencia_segundos = 30
        queda_confirmada = $false
        restauracao_confirmada = $false
    }
    Salvar-Metadados
    Coletar-Saldos 'antes'

    $inicioUtc = (Get-Date).ToUniversalTime().ToString('o')
    $metadados['inicio_comando_carga_utc'] = $inicioUtc
    Salvar-Metadados

    $trabalho = Start-Job -ArgumentList $raizProjeto, $Projeto, $ArquivoUsuarios, $pastaResultado, $nomeCarga -ScriptBlock {
        param($Raiz, $ProjetoCarga, $Usuarios, $Saida, $NomeContainer)
        $ErrorActionPreference = 'Continue'
        [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
        Set-Location -LiteralPath $Raiz
        $argumentos = @(
            'run', '--rm', '--name', $NomeContainer,
            '--network', "${ProjetoCarga}_default",
            '-v', "${Raiz}/carga:/scripts:ro",
            '-v', "${Saida}:/resultados",
            'grafana/k6:2.3.0', 'run',
            '--summary-export', '/resultados/resumo-k6.json',
            '-e', "ARQUIVO_USUARIOS=$Usuarios",
            '-e', 'REPLICAS=4', '-e', 'CONTAS_ESPERADAS=10000',
            '-e', 'VUS=500', '-e', 'DURACAO_SEGUNDOS=60',
            '/scripts/escala.js'
        )
        & docker @argumentos 2>&1 | ForEach-Object {
            Add-Content -LiteralPath (Join-Path $Saida 'execucao.log') -Encoding UTF8 -Value $_.ToString()
        }
        [PSCustomObject]@{
            codigo_k6 = $LASTEXITCODE
            fim_comando_carga_utc = (Get-Date).ToUniversalTime().ToString('o')
        }
    }

    Write-Host 'Carga iniciada. Aguardando a primeira transferencia do lote aparecer no banco...'
    $prazoInicio = (Get-Date).AddSeconds(90)
    $primeiraObservada = $false
    $consulta = "SELECT EXISTS (SELECT 1 FROM transferencia WHERE criada_em >= '$inicioUtc'::timestamptz AND chave_destino LIKE 'seed.$lote.%@teste.example');"
    while ((Get-Date) -lt $prazoInicio) {
        if ($trabalho.State -in @('Completed', 'Failed', 'Stopped')) {
            throw 'A carga terminou antes do gatilho. Confira execucao.log; nenhuma queda foi solicitada.'
        }
        $existe = & docker compose -p $Projeto exec -T transferencias-db psql -At -v ON_ERROR_STOP=1 -U transferencias -d transferencias -c $consulta
        if ($LASTEXITCODE -ne 0) {
            throw 'Falha ao verificar o inicio das transferencias'
        }
        if (($existe -join '').Trim() -eq 't') {
            $primeiraObservada = $true
            break
        }
        Start-Sleep -Seconds 1
    }
    if (-not $primeiraObservada) {
        throw 'Nenhuma transferencia nova observada em 90 segundos; queda cancelada'
    }
    $metadados['primeira_transferencia_observada_utc'] = (Get-Date).ToUniversalTime().ToString('o')
    Salvar-Metadados
    Write-Host 'Transferencias observadas. A queda sera solicitada em 30 segundos.'
    for ($segundo = 0; $segundo -lt 30; $segundo++) {
        if ($trabalho.State -ne 'Running') {
            throw 'A carga terminou antes da queda programada'
        }
        Start-Sleep -Seconds 1
    }

    $metadados['queda_solicitada_utc'] = (Get-Date).ToUniversalTime().ToString('o')
    Salvar-Metadados
    & docker kill --signal KILL $alvo.Id | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'Falha ao derrubar a replica selecionada'
    }
    $estadoQueda = Ler-Container $alvo.Id
    $metadados['queda_confirmada'] = -not $estadoQueda.State.Running
    $metadados['container_finalizado_utc'] = $estadoQueda.State.FinishedAt
    $metadados['codigo_saida_container'] = $estadoQueda.State.ExitCode
    Salvar-Metadados
    if (-not $metadados['queda_confirmada']) {
        throw 'O container voltou a executar antes da confirmacao da queda'
    }
    Write-Host "Replica derrubada: $($alvo.Name). As outras permanecem em execucao."

    $prazoFim = (Get-Date).AddSeconds(150)
    while ($trabalho.State -in @('Running', 'NotStarted')) {
        if ((Get-Date) -gt $prazoFim) {
            throw 'A carga excedeu o prazo de finalizacao'
        }
        Wait-Job -Job $trabalho -Timeout 5 | Out-Null
        Write-Host 'Aguardando a conclusao da carga...'
    }
    $resultado = @(Receive-Job -Job $trabalho -ErrorAction Stop)
    if ($resultado.Count -ne 1 -or $null -eq $resultado[0].codigo_k6) {
        throw 'O processo de carga nao retornou um resultado valido'
    }
    $metadados['codigo_k6'] = $resultado[0].codigo_k6
    $metadados['fim_comando_carga_utc'] = $resultado[0].fim_comando_carga_utc
    Salvar-Metadados
    if ($metadados['codigo_k6'] -notin @(0, 99)) {
        throw "A carga falhou com codigo $($metadados['codigo_k6']); confira o log"
    }
}
catch {
    if ($metadados.Count -gt 0) {
        $metadados['erro_execucao'] = $_.Exception.Message
    }
    throw
}
finally {
    if ($trabalho) {
        try {
            if ($trabalho.State -in @('Running', 'NotStarted')) {
                $preferenciaAnterior = $ErrorActionPreference
                try {
                    $ErrorActionPreference = 'Continue'
                    & docker stop -t 10 $nomeCarga 2>$null | Out-Null
                }
                finally {
                    $ErrorActionPreference = $preferenciaAnterior
                }
                Stop-Job -Job $trabalho
            }
            Remove-Job -Job $trabalho -Force
        }
        catch {
            if ($metadados.Count -gt 0) {
                $metadados['erro_limpeza_carga'] = $_.Exception.Message
            }
            Write-Warning $_.Exception.Message
        }
    }
    if ($alvo -and $metadados.Count -gt 0) {
        try {
            $estado = Ler-Container $alvo.Id
            if (-not $estado.State.Running) {
                & docker start $alvo.Id | Out-Null
                if ($LASTEXITCODE -ne 0) { throw 'Falha ao religar a replica' }
            }
            $prazoSaude = (Get-Date).AddSeconds(60)
            do {
                $estado = Ler-Container $alvo.Id
                if ($estado.State.Running -and $estado.State.Health.Status -eq 'healthy') { break }
                Start-Sleep -Seconds 2
            } while ((Get-Date) -lt $prazoSaude)
            $metadados['restauracao_confirmada'] = $estado.State.Running -and $estado.State.Health.Status -eq 'healthy'
            $metadados['restauracao_verificada_utc'] = (Get-Date).ToUniversalTime().ToString('o')
            if (-not $metadados['restauracao_confirmada']) { throw 'Replica nao ficou saudavel no prazo' }
            Write-Host 'Replica restaurada e saudavel.'
            Start-Sleep -Seconds 10
            Coletar-Saldos 'depois'
        }
        catch {
            $metadados['erro_restauracao_ou_coleta'] = $_.Exception.Message
            Write-Warning $_.Exception.Message
        }
        Salvar-Metadados
        Write-Host "Resultados em: $pastaResultado"
    }
    Pop-Location
}
