$ErrorActionPreference = 'Stop'

$raizProjeto = Split-Path -Parent $PSScriptRoot
$arquivoEnv = Join-Path $raizProjeto '.env'

$linhaSenha = Select-String -LiteralPath $arquivoEnv `
    -Pattern '^NOTIFICACOES_DB_PASSWORD=(.*)$'

if (-not $linhaSenha -or @($linhaSenha).Count -ne 1) {
    throw 'Defina uma única NOTIFICACOES_DB_PASSWORD no .env da raiz.'
}

$senhaBanco = $linhaSenha.Matches[0].Groups[1].Value.Trim()
$senhaBanco = $senhaBanco.Trim('"').Trim("'")

if ([string]::IsNullOrWhiteSpace($senhaBanco)) {
    throw 'NOTIFICACOES_DB_PASSWORD está vazia.'
}

$senhaCodificada = [Uri]::EscapeDataString($senhaBanco)

$urlAnterior = $env:DATABASE_URL
$segredoAnterior = $env:JWT_SECRET

Push-Location $PSScriptRoot

try {
    $env:DATABASE_URL = "postgres://notificacoes:${senhaCodificada}@localhost:5436/notificacoes_test"
    $env:JWT_SECRET = 'segredo-exclusivo-dos-testes-de-notificacoes'

    npm.cmd test

    if ($LASTEXITCODE -ne 0) {
        throw 'A execução dos testes falhou. Confira o resultado acima.'
    }
}
finally {
    $env:DATABASE_URL = $urlAnterior
    $env:JWT_SECRET = $segredoAnterior
    Pop-Location
}