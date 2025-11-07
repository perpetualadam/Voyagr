Write-Host "=== Testing Routing Engine Endpoints ===" -ForegroundColor Cyan

# Test GraphHopper
Write-Host "`n1. GraphHopper (81.0.246.97:8989)" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://81.0.246.97:8989/info" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "   Status: OK" -ForegroundColor Green
    $data = $response.Content | ConvertFrom-Json
    Write-Host "   Version: $($data.version)"
    Write-Host "   Profiles: $(($data.profiles | ForEach-Object { $_.name }) -join ', ')"
} catch {
    Write-Host "   Status: OFFLINE" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)"
}

# Test Valhalla
Write-Host "`n2. Valhalla (141.147.102.102:8002)" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://141.147.102.102:8002/status" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "   Status: OK" -ForegroundColor Green
    $data = $response.Content | ConvertFrom-Json
    Write-Host "   Version: $($data.version)"
    Write-Host "   Available Actions: $(($data.available_actions | Select-Object -First 5) -join ', ')"
} catch {
    Write-Host "   Status: OFFLINE" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)"
}

# Test OSRM
Write-Host "`n3. OSRM (router.project-osrm.org)" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://router.project-osrm.org/route/v1/driving/-0.1278,51.5074;-3.7373,50.7520" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "   Status: OK" -ForegroundColor Green
    $data = $response.Content | ConvertFrom-Json
    Write-Host "   Code: $($data.code)"
    Write-Host "   Routes Found: $($data.routes.Count)"
} catch {
    Write-Host "   Status: OFFLINE" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)"
}

Write-Host "`n=== Summary ===" -ForegroundColor Cyan
Write-Host "GraphHopper: http://81.0.246.97:8989"
Write-Host "Valhalla: http://141.147.102.102:8002"
Write-Host "OSRM: http://router.project-osrm.org (public service)"

