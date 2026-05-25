# start-n8n.ps1
# Inicia o ambiente local de desenvolvimento das automacoes SST.
#
# O que este script faz, em ordem:
#   1. Carrega as variaveis de ambiente do arquivo .env
#   2. Verifica se o ngrok ja esta rodando; se nao, inicia em background
#   3. Exibe a URL publica do ngrok (use apenas para testes manuais do webhook Meta)
#   4. Inicia o n8n em http://localhost:5678
#
# Uso:
#   .\start-n8n.ps1
#
# Fluxo completo de trabalho (rodar a cada sessao):
#   1. Rodar este script no terminal
#   2. Verificar a URL do ngrok exibida no terminal
#   3. Acessar o n8n em http://localhost:5678
#   4. Para teste local do webhook Meta, use curl/ngrok controlado e nao altere a URL de producao sem combinar.
#
# Observacoes:
#   - O ngrok gratuito gera uma URL diferente a cada reinicio
#   - O n8n ocupa este terminal enquanto estiver rodando (Ctrl+C para parar)
#   - Credenciais ficam no arquivo .env (nunca commitar no git)
#   - n8n instalado globalmente via "npm install -g n8n" (nao usa npx)
#     Dados persistem em %USERPROFILE%\.n8n (banco SQLite, credenciais, workflows)

# --- 1. Carregar variaveis de ambiente ---
Get-Content .env | Where-Object { $_ -match '^\s*[^#]' } | ForEach-Object {
    $parts = $_ -split '=', 2
    if ($parts.Count -eq 2) {
        $key = $parts[0].Trim()
        # Remove inline comment (everything after first # not inside quotes), then trim
        $val = ($parts[1] -replace '\s+#.*$', '').Trim()
        [System.Environment]::SetEnvironmentVariable($key, $val, 'Process')
    }
}

# --- 2. Verificar/iniciar ngrok ---
try {
    $tunnels = (Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels" -ErrorAction Stop).tunnels
    Write-Host "ngrok: $($tunnels[0].public_url)"
} catch {
    Write-Host "Iniciando ngrok..."
    $ngrokPath = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe"
    Start-Process -FilePath $ngrokPath -ArgumentList "http 5678" -WindowStyle Hidden
    Start-Sleep 3
    $url = (Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels").tunnels[0].public_url
    Write-Host "ngrok: $url"
    Write-Host "URL ngrok pronta para testes locais controlados."
}

# --- 3. Iniciar n8n ---
Write-Host "n8n: http://localhost:5678"
$env:N8N_BLOCK_ENV_ACCESS_IN_NODE="false"
$env:NODE_FUNCTION_ALLOW_BUILTIN="crypto,zlib,https,http"
$env:NODE_FUNCTION_ALLOW_EXTERNAL="fast-xml-parser"
$env:META_HMAC_MODE="log_only"
n8n
