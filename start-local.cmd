@echo off
cd /d "%~dp0"
echo Open http://127.0.0.1:4173/english-vocabulary/index.html?demo
echo Keep this window open while using the website. Ctrl+C stops it.
node tools/serve.mjs
pause
