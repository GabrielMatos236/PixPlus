param(
    [ValidateSet('antes', 'depois', 'conferencia')]
    [string]$Etapa = 'conferencia'
)

$ErrorActionPreference = 'Stop'

$raizProjeto = Split-Path -Parent $PSScriptRoot
$scriptConsulta = Join-Path $PSScriptRoot 'verificar-saldos.mjs'
$destino = Join-Path $PSScriptRoot "resultados-saldos-$Etapa.json"

Push-Location $raizProjeto

try {
    $resultado = Get-Content -Raw -Encoding UTF8 $scriptConsulta |
        docker compose exec -T contas node --input-type=module

    if ($LASTEXITCODE -ne 0) {
        throw 'Falha na coleta. Nenhum resultado foi salvo.'
    }

    $json = $resultado -join "`n"
    $null = $json | ConvertFrom-Json

    [System.IO.File]::WriteAllText(
        $destino,
        $json + "`n",
        [System.Text.UTF8Encoding]::new($false)
    )

    Write-Host "Coleta salva em: $destino"
}
finally {
    Pop-Location
}