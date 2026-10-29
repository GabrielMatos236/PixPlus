# Roda os testes automatizados do Auth num banco separado (auth_test),
# dentro do mesmo container auth-db. O banco de desenvolvimento não é tocado.
# Uso, na pasta auth:  .\test.ps1

$raiz = Join-Path $PSScriptRoot '..'
$linha = Select-String -Path (Join-Path $raiz '.env') -Pattern '^AUTH_DB_PASSWORD=(.*)$'
if (-not $linha) {
    Write-Host 'AUTH_DB_PASSWORD não encontrada no .env da raiz do projeto.' -ForegroundColor Red
    exit 1
}
$senha = $linha.Matches[0].Groups[1].Value.Trim()

# Cria o banco auth_test na primeira vez. Se já existir, o erro é ignorado.
Push-Location $raiz
docker compose exec -T auth-db createdb -U auth auth_test *> $null
Pop-Location

$env:DATABASE_URL = "postgres://auth:$senha@localhost:5433/auth_test"
Set-Location $PSScriptRoot
npm test
exit $LASTEXITCODE
