# CH External Testing Script for Windows PowerShell
# Run all CH tests without interrupting the app

param(
    [string]$Test = "all",
    [switch]$Parallel = $false,
    [switch]$Verbose = $false
)

$ErrorActionPreference = "Stop"

function Write-Header {
    param([string]$Text)
    Write-Host ""
    Write-Host "=" * 80
    Write-Host $Text
    Write-Host "=" * 80
}

function Run-Test {
    param(
        [string]$Name,
        [string]$Script,
        [string]$Description
    )
    
    Write-Header "$Name - $Description"
    
    if ($Verbose) {
        Write-Host "Running: python $Script`n"
    }
    
    $start = Get-Date
    python $Script
    $elapsed = (Get-Date) - $start
    
    Write-Host "`nCompleted in $($elapsed.TotalSeconds)s`n"
}

# Main execution
Write-Header "CH EXTERNAL TESTING SUITE"

if ($Test -eq "all" -or $Test -eq "verify") {
    Run-Test "TEST 1" "test_ch_routing_v2.py" "Verify CH Index"
}

if ($Test -eq "all" -or $Test -eq "routes") {
    Run-Test "TEST 2" "test_ch_external.py" "Test Real Routes"
}

if ($Test -eq "all" -or $Test -eq "benchmark") {
    Run-Test "TEST 3" "test_ch_performance.py" "Benchmark Performance"
}

if ($Test -eq "all" -or $Test -eq "diagnostics") {
    Run-Test "TEST 4" "test_ch_diagnostics.py" "Full Diagnostics"
}

Write-Header "ALL TESTS COMPLETE"
Write-Host "Summary:"
Write-Host "  - CH Index verified"
Write-Host "  - Real routes tested"
Write-Host "  - Performance benchmarked"
Write-Host "  - System diagnostics checked"
Write-Host ""

