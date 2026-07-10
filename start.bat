@echo off
title Command Center - On Call
color 0A

echo ============================================
echo    Command Center - On Call
echo ============================================
echo.
echo Iniciando aplicacao...
echo.

:: Verificar se o .env existe
if not exist ".env" (
    echo [AVISO] Arquivo .env nao encontrado. Criando com valores padrao...
    echo DATADOG_API_KEY=placeholder> .env
    echo DATADOG_APP_KEY=placeholder>> .env
    echo JWT_SECRET=command-center-secret-key-2024>> .env
    echo PORT=3000>> .env
    echo CORS_ORIGINS=http://localhost:5173,http://localhost:3000>> .env
    echo.
)

:: Compilar backend (caso tenha alteracoes)
echo [1/3] Compilando backend...
call npx tsc --skipLibCheck 2>nul
if %errorlevel% neq 0 (
    echo [AVISO] Compilacao com avisos, continuando...
)

:: Iniciar backend em background
echo [2/3] Iniciando backend na porta 3000...
start /B "Backend" cmd /c "node dist/backend/index.js"

:: Aguardar backend subir
timeout /t 3 /nobreak >nul

:: Iniciar frontend
echo [3/3] Iniciando frontend na porta 5173...
cd dpsp-command-on-call-frontend
start /B "Frontend" cmd /c "npx vite --port 5173"
cd ..

:: Aguardar frontend subir
timeout /t 4 /nobreak >nul

echo.
echo ============================================
echo    APLICACAO RODANDO!
echo ============================================
echo.
echo    Frontend: http://localhost:5173
echo    Backend:  http://localhost:3000
echo    Login:    admin / admin123
echo.
echo    Pressione qualquer tecla para PARAR...
echo ============================================

pause >nul

:: Matar processos node
echo.
echo Parando aplicacao...
taskkill /F /FI "WINDOWTITLE eq Backend" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq Frontend" >nul 2>&1

echo Aplicacao encerrada.
timeout /t 2 >nul
