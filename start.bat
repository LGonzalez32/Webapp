@echo off
cd /d "%~dp0"

:: ── Configuracion de puerto (cambia aqui) ────────────────────────────────────
set FRONTEND_PORT=3000

echo ===========================================
echo   InventoryFlow -- Iniciando servidor
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

:: ── [0/1] Liberar puerto si esta ocupado ─────────────────────────────────────
echo [0/1] Liberando puerto %FRONTEND_PORT%...
for /f "tokens=5" %%p in ('netstat -aon 2^>nul ^| findstr ":%FRONTEND_PORT% " ^| findstr "LISTENING"') do (
  echo   Matando PID %%p ocupando puerto %FRONTEND_PORT%...
  taskkill /F /PID %%p >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: ── Frontend (Vite) ───────────────────────────────────────────────────────────
echo [1/1] Iniciando InventoryFlow (Vite en :%FRONTEND_PORT%)...
start "InventoryFlow" cmd /k "cd /d "%~dp0" && npm run dev"

:: Esperar 2 segundos para que Vite arranque
timeout /t 2 /nobreak >nul

echo.
echo Listo!
echo   App:  http://localhost:%FRONTEND_PORT%
echo.
echo ── Checklist rapido ─────────────────────────────────────────────────────
echo   netstat -ano ^| findstr :%FRONTEND_PORT%   ^(debe decir LISTENING^)
echo   Abre el navegador en: http://localhost:%FRONTEND_PORT%
echo ─────────────────────────────────────────────────────────────────────────
echo.
echo Si Vite no arranca:
echo   npm install
echo   npm run dev
echo.
pause
