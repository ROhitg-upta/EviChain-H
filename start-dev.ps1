# EviChain — Start both servers
# Run this once: .\start-dev.ps1
# Keep this terminal open. Both servers will restart automatically on file changes.

Write-Host "Starting EviChain backend on port 4000..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$PSScriptRoot\server'; npm run dev"

Write-Host "Starting EviChain frontend on port 3000..." -ForegroundColor Green  
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$PSScriptRoot'; npm run dev"

Write-Host ""
Write-Host "Both servers starting in separate windows." -ForegroundColor Cyan
Write-Host "Backend:  http://localhost:4000/health" -ForegroundColor Yellow
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Yellow
Write-Host ""
Write-Host "Keep those two windows OPEN. Closing them stops the servers." -ForegroundColor Red
