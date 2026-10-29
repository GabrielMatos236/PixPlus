# Roda o Auth no seu PC, ligado ao banco auth do Docker (porta 5433).
# Uso, na pasta auth:  .\dev.ps1
# O serviço reinicia sozinho quando você salva um arquivo. Ctrl+C para parar.

$arquivoEnv = Join-Path $PSScriptRoot '..\.env'
$linha = Select-String -Path $arquivoEnv -Pattern '^AUTH_DB_PASSWORD=(.*)$'
if (-not $linha) {
    Write-Host 'AUTH_DB_PASSWORD não encontrada no .env da raiz do projeto.' -ForegroundColor Red
    exit 1
}
$senha = $linha.Matches[0].Groups[1].Value.Trim()
$env:DATABASE_URL = "postgres://auth:$senha@localhost:5433/auth"
$linhaSegredo = Select-String -Path $arquivoEnv -Pattern '^JWT_SECRET=(.*)$'
$env:JWT_SECRET = $linhaSegredo.Matches[0].Groups[1].Value.Trim()

Set-Location $PSScriptRoot

npm run migrate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run dev
