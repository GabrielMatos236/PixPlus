# Roda Transferências no seu PC, ligado ao banco transferencias do Docker (porta 5435).
# Uso, na pasta transferencias:  .\dev.ps1
# O serviço reinicia sozinho quando você salva um arquivo. Ctrl+C para parar.

$arquivoEnv = Join-Path $PSScriptRoot '..\.env'
$linha = Select-String -Path $arquivoEnv -Pattern '^TRANSFERENCIAS_DB_PASSWORD=(.*)$'
if (-not $linha) {
    Write-Host 'TRANSFERENCIAS_DB_PASSWORD não encontrada no .env da raiz do projeto.' -ForegroundColor Red
    exit 1
}
$senha = $linha.Matches[0].Groups[1].Value.Trim()
$env:DATABASE_URL = "postgres://transferencias:$senha@localhost:5435/transferencias"
$linhaSegredo = Select-String -Path $arquivoEnv -Pattern '^JWT_SECRET=(.*)$'
$env:JWT_SECRET = $linhaSegredo.Matches[0].Groups[1].Value.Trim()

Set-Location $PSScriptRoot

npm run migrate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run dev
