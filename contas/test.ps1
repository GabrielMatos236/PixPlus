# Roda os testes automatizados de Contas num banco separado (contas_test),
# dentro do mesmo container contas-db. O banco de desenvolvimento não é tocado.
# Uso, na pasta contas:  .\test.ps1

$raiz = Join-Path $PSScriptRoot '..'
$linha = Select-String -Path (Join-Path $raiz '.env') -Pattern '^CONTAS_DB_PASSWORD=(.*)$'
if (-not $linha) {
    Write-Host 'CONTAS_DB_PASSWORD não encontrada no .env da raiz do projeto.' -ForegroundColor Red
    exit 1
}
$senha = $linha.Matches[0].Groups[1].Value.Trim()

# Cria o banco contas_test na primeira vez. Se já existir, o erro é ignorado.
Push-Location $raiz
docker compose exec -T contas-db createdb -U contas contas_test *> $null
Pop-Location

$env:DATABASE_URL = "postgres://contas:$senha@localhost:5434/contas_test"
$env:JWT_SECRET = 'segredo-so-para-os-testes-automatizados'
Set-Location $PSScriptRoot
npm test
exit $LASTEXITCODE
