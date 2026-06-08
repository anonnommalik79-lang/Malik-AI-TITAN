@echo off

title Malik AI

cd /d "%~dp0"



echo.

echo Malik AI Sovereign Hub

echo ======================

echo.



echo [1/5] Freeing port 3000...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1



echo [2/5] Clearing stale Next.js build lock...

if exist ".next\lock" del /f /q ".next\lock" >nul 2>&1



set "HAS_BUILD=0"

if exist ".next\BUILD_ID" set "HAS_BUILD=1"

if exist ".next\build\BUILD_ID" set "HAS_BUILD=1"



if "%HAS_BUILD%"=="0" (

  echo [3/5] First launch: building app ^(1-2 min^)...

  call npm run build

  if errorlevel 1 (

    echo.

    echo BUILD FAILED. If you see "Another next build process is already running":

    echo   - Close other npm/node windows

    echo   - Delete .next\lock

    echo   - Run: npm run build

    echo.

    pause >nul

    exit /b 1

  )

) else (

  echo [3/5] Build found, skipping compile.

)



echo [4/5] Starting server...

start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000/dashboard"



echo [5/5] npm start - keep this window open

echo      Dashboard: http://localhost:3000/dashboard

echo      Health:    http://localhost:3000/api/health/providers

echo      Stop server: Ctrl+C

echo.



call npm start



if errorlevel 1 (

  echo.

  echo START FAILED. Press any key...

  pause >nul

)

