@echo off
cd /d "%~dp0"
title Botora Backend
set PUPPETEER_SKIP_DOWNLOAD=true
set PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
npm run dev
pause
