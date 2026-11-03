# Roda os testes automatizados de Transferências num banco separado (transferencias_test),
# dentro do mesmo container transferencias-db. O banco de desenvolvimento não é tocado.
# Uso, na pasta transferencias:  .\test.ps1

$raiz = Join-Path $PSScriptRoot '..'
$linha = Select-String -Path (Join-Path $raiz '.env') -Pattern '^TRANSFERENCIAS_DB_PASSWORD=(.*)$'
if (-not $linha) {
    Write-Host 'TRANSFERENCIAS_DB_PASSWORD não encontrada no .env da raiz do projeto.' -ForegroundColor Red
    exit 1
}
$senha = $linha.Matches[0].Groups[1].Value.Trim()

# Cria o banco transferencias_test na primeira vez. Se já existir, o erro é ignorado.
Push-Location $raiz
docker compose exec -T transferencias-db createdb -U transferencias transferencias_test *> $null
Pop-Location

$env:DATABASE_URL = "postgres://transferencias:$senha@localhost:5435/transferencias_test"
$env:JWT_SECRET = 'segredo-so-para-os-testes-automatizados'
Set-Location $PSScriptRoot
npm test
exit $LASTEXITCODE
