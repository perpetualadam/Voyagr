# Test Hazard Avoidance API Endpoints
# Run this script to test all hazard avoidance features

$baseUrl = "http://localhost:5000"

Write-Host "🧪 Testing Hazard Avoidance API Endpoints" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Get Hazard Preferences
Write-Host "Test 1: Get Hazard Preferences" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/hazard-preferences" -ErrorAction Stop
    $data = $response.Content | ConvertFrom-Json
    Write-Host "✅ Success! Found $(($data.preferences | Measure-Object).Count) hazard types" -ForegroundColor Green
    $data.preferences | ForEach-Object {
        Write-Host "   - $($_.hazard_type): $($_.penalty_seconds)s penalty, $($_.proximity_threshold_meters)m threshold, enabled=$($_.enabled)"
    }
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 2: Report a Hazard
Write-Host "Test 2: Report a Hazard (Speed Camera)" -ForegroundColor Yellow
try {
    $body = @{
        lat = 51.5074
        lon = -0.1278
        hazard_type = "speed_camera"
        description = "M25 Junction 10"
        severity = "high"
        user_id = "test_user"
    } | ConvertTo-Json
    
    $response = Invoke-WebRequest -Uri "$baseUrl/api/hazards/report" `
        -Method POST `
        -Headers @{"Content-Type"="application/json"} `
        -Body $body `
        -ErrorAction Stop
    
    $data = $response.Content | ConvertFrom-Json
    Write-Host "✅ Success! Report ID: $($data.report_id)" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 3: Add a Camera
Write-Host "Test 3: Add a Camera Location" -ForegroundColor Yellow
try {
    $body = @{
        lat = 51.5100
        lon = -0.1300
        type = "speed_camera"
        description = "A1 North"
    } | ConvertTo-Json
    
    $response = Invoke-WebRequest -Uri "$baseUrl/api/hazards/add-camera" `
        -Method POST `
        -Headers @{"Content-Type"="application/json"} `
        -Body $body `
        -ErrorAction Stop
    
    $data = $response.Content | ConvertFrom-Json
    Write-Host "✅ Success! Camera ID: $($data.camera_id)" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 4: Get Nearby Hazards
Write-Host "Test 4: Get Nearby Hazards (5km radius)" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/hazards/nearby?lat=51.5074&lon=-0.1278&radius=5" `
        -ErrorAction Stop
    
    $data = $response.Content | ConvertFrom-Json
    $cameraCount = ($data.hazards.cameras | Measure-Object).Count
    $reportCount = ($data.hazards.reports | Measure-Object).Count
    
    Write-Host "✅ Success! Found $cameraCount cameras and $reportCount reports" -ForegroundColor Green
    
    if ($cameraCount -gt 0) {
        Write-Host "   Cameras:" -ForegroundColor Cyan
        $data.hazards.cameras | ForEach-Object {
            Write-Host "   - $($_.type) at $($_.lat),$($_.lon) ($($_.distance_meters)m away)"
        }
    }
    
    if ($reportCount -gt 0) {
        Write-Host "   Reports:" -ForegroundColor Cyan
        $data.hazards.reports | ForEach-Object {
            Write-Host "   - $($_.type): $($_.description) ($($_.distance_meters)m away)"
        }
    }
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 5: Calculate Route with Hazard Avoidance
Write-Host "Test 5: Calculate Route with Hazard Avoidance" -ForegroundColor Yellow
try {
    $body = @{
        start = "51.5074,-0.1278"
        end = "51.5174,-0.1278"
        enable_hazard_avoidance = $true
    } | ConvertTo-Json
    
    $response = Invoke-WebRequest -Uri "$baseUrl/api/route" `
        -Method POST `
        -Headers @{"Content-Type"="application/json"} `
        -Body $body `
        -ErrorAction Stop
    
    $data = $response.Content | ConvertFrom-Json
    Write-Host "✅ Success! Route calculated" -ForegroundColor Green
    Write-Host "   Distance: $($data.distance)" -ForegroundColor Cyan
    Write-Host "   Time: $($data.time)" -ForegroundColor Cyan
    Write-Host "   Source: $($data.source)" -ForegroundColor Cyan
    
    if ($data.hazard_count) {
        Write-Host "   Hazards on route: $($data.hazard_count)" -ForegroundColor Yellow
        Write-Host "   Hazard penalty: $($data.hazard_time_penalty_minutes) minutes" -ForegroundColor Yellow
    } else {
        Write-Host "   No hazards on route ✅" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 6: Update Hazard Preference
Write-Host "Test 6: Update Hazard Preference" -ForegroundColor Yellow
try {
    $body = @{
        hazard_type = "speed_camera"
        penalty_seconds = 60
        enabled = $true
        proximity_threshold_meters = 150
    } | ConvertTo-Json
    
    $response = Invoke-WebRequest -Uri "$baseUrl/api/hazard-preferences" `
        -Method POST `
        -Headers @{"Content-Type"="application/json"} `
        -Body $body `
        -ErrorAction Stop
    
    $data = $response.Content | ConvertFrom-Json
    Write-Host "✅ Success! $($data.message)" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "🎉 All tests completed!" -ForegroundColor Green
Write-Host ""

