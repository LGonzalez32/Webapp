@echo off
cd /d "%~dp0"

:: ── Configuracion de puerto (cambia aqui) ────────────────────────────────────
set FRONTEND_PORT=3000

echo ===========================================
echo   SalesFlow -- Iniciando servidor
echo ===========================================
echo.

:: ── Guard: node_modules debe existir ─────────────────────────────────────────
IF NOT EXIST "%~dp0node_modules" (
  echo.
  echo [ERROR] No existe node_modules
  echo         Instala las dependencias primero:
  echo           npm install
  echo.
  pause
  exit /b 1
)

:: ── [0/2] Liberar puerto si esta ocupado ─────────────────────────────────────
echo [0/2] Liberando puerto %FRONTEND_PORT%...
for /f "tokens=5" %%p in ('netstat -aon 2^>nul ^| findstr ":%FRONTEND_PORT% " ^| findstr "LISTENING"') do (
  echo   Matando PID %%p ocupando puerto %FRONTEND_PORT%...
  taskkill /F /PID %%p >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: ── [1/2] Backend Python (FastAPI en puerto 8000) ────────────────────────────
echo [1/2] Iniciando backend IA (FastAPI en :8000)...
start "SalesFlow Backend" cmd /k "cd /d "%~dp0backend" && python -m uvicorn main:app --reload --port 8000"
timeout /t 3 /nobreak >nul

:: ── [2/2] Frontend (Vite) ─────────────────────────────────────────────────────
echo [2/2] Iniciando SalesFlow (Vite en :%FRONTEND_PORT%)...
start "SalesFlow Frontend" cmd /k "cd /d "%~dp0" && npm run dev"

:: Esperar 2 segundos para que Vite arranque
timeout /t 2 /nobreak >nul

echo.
echo Listo!
echo   App:   http://localhost:%FRONTEND_PORT%
echo   API:   http://localhost:8000/api/v1/health
echo.
pause
