# GraphHopper Custom Model Testing Script
# Run this from Windows PowerShell to test custom model routing

param(
    [string]$GraphHopperUrl = "http://81.0.246.97:8989",
    [string]$CustomModelId = "model_1"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "GraphHopper Custom Model Testing" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Check GraphHopper Status
Write-Host "Test 1: Checking GraphHopper Status" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$GraphHopperUrl/info" -ErrorAction Stop -TimeoutSec 5
    $data = $response.Content | ConvertFrom-Json
    Write-Host "✅ GraphHopper is running!" -ForegroundColor Green
    Write-Host "   Version: $($data.version)" -ForegroundColor Cyan
    Write-Host "   Profiles: $($data.profiles -join ', ')" -ForegroundColor Cyan
} catch {
    Write-Host "❌ GraphHopper is not responding" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Test 2: List Custom Models
Write-Host "Test 2: Listing Custom Models" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$GraphHopperUrl/custom-models" -ErrorAction Stop -TimeoutSec 5
    $data = $response.Content | ConvertFrom-Json
    Write-Host "✅ Custom models endpoint responding" -ForegroundColor Green
    Write-Host "   Response: $($data | ConvertTo-Json)" -ForegroundColor Cyan
} catch {
    Write-Host "⚠️  Custom models endpoint not available" -ForegroundColor Yellow
    Write-Host "   This is normal if custom models not yet uploaded" -ForegroundColor Yellow
}
Write-Host ""

# Test 3: Test Route WITHOUT Custom Model
Write-Host "Test 3: Route WITHOUT Custom Model (Baseline)" -ForegroundColor Yellow
try {
    $params = @{
        point = "51.5074,-0.1278"
        point = "51.5174,-0.1278"
        vehicle = "car"
    }
    
    $uri = "$GraphHopperUrl/route?" + (($params.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join "&")
    
    $response = Invoke-WebRequest -Uri $uri -ErrorAction Stop -TimeoutSec 10
    $data = $response.Content | ConvertFrom-Json
    
    if ($data.paths -and $data.paths.Count -gt 0) {
        $path = $data.paths[0]
        $distance = $path.distance / 1000
        $time = $path.time / 60000
        
        Write-Host "✅ Route calculated successfully" -ForegroundColor Green
        Write-Host "   Distance: $([Math]::Round($distance, 2)) km" -ForegroundColor Cyan
        Write-Host "   Time: $([Math]::Round($time, 1)) minutes" -ForegroundColor Cyan
        Write-Host "   Points: $($path.points.Count) waypoints" -ForegroundColor Cyan
    } else {
        Write-Host "❌ No paths in response" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Route calculation failed" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 4: Test Route WITH Custom Model
Write-Host "Test 4: Route WITH Custom Model (Camera Avoidance)" -ForegroundColor Yellow
try {
    $params = @{
        point = "51.5074,-0.1278"
        point = "51.5174,-0.1278"
        vehicle = "car"
        custom_model_id = $CustomModelId
    }
    
    $uri = "$GraphHopperUrl/route?" + (($params.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join "&")
    
    Write-Host "   URL: $uri" -ForegroundColor Gray
    
    $response = Invoke-WebRequest -Uri $uri -ErrorAction Stop -TimeoutSec 10
    $data = $response.Content | ConvertFrom-Json
    
    if ($data.paths -and $data.paths.Count -gt 0) {
        $path = $data.paths[0]
        $distance = $path.distance / 1000
        $time = $path.time / 60000
        
        Write-Host "✅ Route with custom model calculated" -ForegroundColor Green
        Write-Host "   Distance: $([Math]::Round($distance, 2)) km" -ForegroundColor Cyan
        Write-Host "   Time: $([Math]::Round($time, 1)) minutes" -ForegroundColor Cyan
        Write-Host "   Points: $($path.points.Count) waypoints" -ForegroundColor Cyan
    } else {
        Write-Host "❌ No paths in response" -ForegroundColor Red
    }
} catch {
    Write-Host "⚠️  Custom model routing failed" -ForegroundColor Yellow
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "   This is normal if custom model not yet uploaded" -ForegroundColor Yellow
}
Write-Host ""

# Test 5: Test Multiple Routes
Write-Host "Test 5: Testing Multiple Routes" -ForegroundColor Yellow
$testRoutes = @(
    @{ name = "London to Manchester"; start = "51.5074,-0.1278"; end = "53.4808,-2.2426" },
    @{ name = "London to Birmingham"; start = "51.5074,-0.1278"; end = "52.5086,-1.8755" },
    @{ name = "London to Leeds"; start = "51.5074,-0.1278"; end = "53.8008,-1.5491" }
)

foreach ($route in $testRoutes) {
    try {
        $params = @{
            point = $route.start
            point = $route.end
            vehicle = "car"
            custom_model_id = $CustomModelId
        }
        
        $uri = "$GraphHopperUrl/route?" + (($params.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join "&")
        
        $response = Invoke-WebRequest -Uri $uri -ErrorAction Stop -TimeoutSec 10
        $data = $response.Content | ConvertFrom-Json
        
        if ($data.paths -and $data.paths.Count -gt 0) {
            $path = $data.paths[0]
            $distance = $path.distance / 1000
            $time = $path.time / 60000
            
            Write-Host "   ✅ $($route.name)" -ForegroundColor Green
            Write-Host "      Distance: $([Math]::Round($distance, 2)) km, Time: $([Math]::Round($time, 1)) min" -ForegroundColor Cyan
        }
    } catch {
        Write-Host "   ⚠️  $($route.name) - Failed" -ForegroundColor Yellow
    }
}
Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Testing Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Summary:" -ForegroundColor Yellow
Write-Host "- GraphHopper URL: $GraphHopperUrl" -ForegroundColor Cyan
Write-Host "- Custom Model ID: $CustomModelId" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. If tests passed, update voyagr_web.py with custom_model_id" -ForegroundColor Cyan
Write-Host "2. Add to .env: GRAPHHOPPER_CUSTOM_MODEL_ID=$CustomModelId" -ForegroundColor Cyan
Write-Host "3. Restart voyagr_web.py" -ForegroundColor Cyan
Write-Host "4. Test routing from web app" -ForegroundColor Cyan
Write-Host ""

