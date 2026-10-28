<#
.SYNOPSIS
    PayRoute One-Click Local Startup Script
.DESCRIPTION
    Starts the Express API server, BullMQ worker, and Cloudflare Quick Tunnel in separate
    labeled console windows. Verifies health endpoints and detects tunnel/frontend URL alignment.
#>

[CmdletBinding()]
param(
    [int]$Port = 4000,
    [string]$DashboardUrl = "https://payroute-dashboard.pages.dev"
)

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "         PayRoute Orchestration Engine -- Startup           " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$rootDir = Split-Path -Parent $PSScriptRoot
Set-Location $rootDir

# ---------------------------------------------------------------------------
# 1. Environment & Pre-flight Checks
# ---------------------------------------------------------------------------
Write-Host "[1/5] Checking environment..." -ForegroundColor Yellow

if (-not (Test-Path "$rootDir\.env")) {
    Write-Host "[ERROR] .env file not found at $rootDir\.env!" -ForegroundColor Red
    Write-Host "Please create a .env file from .env.example before starting." -ForegroundColor Yellow
    exit 1
}

$cloudflaredPath = "$env:LOCALAPPDATA\Programs\cloudflared\cloudflared.exe"
if (-not (Test-Path $cloudflaredPath)) {
    $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($cmd) {
        $cloudflaredPath = $cmd.Source
    } else {
        Write-Host "[WARNING] cloudflared.exe not found at $cloudflaredPath or in PATH." -ForegroundColor Yellow
        Write-Host "Cloudflare Quick Tunnel will not be started automatically." -ForegroundColor Yellow
        $cloudflaredPath = $null
    }
}

$tunnelLogDir = "$env:LOCALAPPDATA\Programs\cloudflared"
if (-not (Test-Path $tunnelLogDir)) {
    New-Item -ItemType Directory -Path $tunnelLogDir -Force | Out-Null
}
$tunnelLog = "$tunnelLogDir\tunnel.log"

# ---------------------------------------------------------------------------
# 2. Check & Start API Server
# ---------------------------------------------------------------------------
Write-Host "[2/5] Checking PayRoute API Server (Port $Port)..." -ForegroundColor Yellow

$apiConn = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
$apiRunning = $false

if ($apiConn) {
    try {
        $healthCheck = (Invoke-WebRequest -Uri "http://localhost:$Port/api/health" -UseBasicParsing -TimeoutSec 3).Content
        if ($healthCheck -like '*"ok"*') {
            Write-Host "  [OK] API Server is already running on port $Port (PID: $($apiConn.OwningProcess))" -ForegroundColor Green
            $apiRunning = $true
        }
    } catch {
        Write-Host "  [WARNING] Port $Port is open but /api/health did not respond 'ok'." -ForegroundColor Yellow
    }
}

if (-not $apiRunning) {
    Write-Host "  Launching API Server in a new window..." -ForegroundColor Cyan
    $apiCmd = "title PayRoute API Server & npm run dev -w backend"
    Start-Process -FilePath "cmd.exe" -ArgumentList @('/k', $apiCmd) -WorkingDirectory $rootDir

    Write-Host "  Waiting for API server to become ready..." -NoNewline
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        Write-Host "." -NoNewline
        try {
            $resp = (Invoke-WebRequest -Uri "http://localhost:$Port/api/health" -UseBasicParsing -TimeoutSec 2).Content
            if ($resp -like '*"ok"*') {
                $ready = $true
                break
            }
        } catch {}
    }
    Write-Host ""
    if ($ready) {
        Write-Host "  [OK] API Server is healthy on http://localhost:$Port" -ForegroundColor Green
    } else {
        Write-Host "  [ERROR] API Server failed to respond on http://localhost:$Port within 30 seconds." -ForegroundColor Red
        Write-Host "  Check the 'PayRoute API Server' console window for logs." -ForegroundColor Yellow
    }
}

# ---------------------------------------------------------------------------
# 3. Check & Start BullMQ Worker
# ---------------------------------------------------------------------------
Write-Host "[3/5] Checking PayRoute BullMQ Worker..." -ForegroundColor Yellow

$workerProc = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" -ErrorAction SilentlyContinue | 
    Where-Object { $_.CommandLine -like "*worker.ts*" -and ($_.CommandLine -like "*$rootDir*" -or $_.CommandLine -like "*PayRoute*") } | 
    Select-Object -First 1

if ($workerProc) {
    Write-Host "  [OK] BullMQ Worker is already running (PID: $($workerProc.ProcessId))" -ForegroundColor Green
} else {
    Write-Host "  Launching BullMQ Worker in a new window..." -ForegroundColor Cyan
    $workerCmd = "title PayRoute BullMQ Worker & npm run dev:worker -w backend"
    Start-Process -FilePath "cmd.exe" -ArgumentList @('/k', $workerCmd) -WorkingDirectory $rootDir
    Start-Sleep -Seconds 2
    Write-Host "  [OK] BullMQ Worker window launched." -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# 4. Check & Start Cloudflare Quick Tunnel
# ---------------------------------------------------------------------------
Write-Host "[4/5] Checking Cloudflare Quick Tunnel..." -ForegroundColor Yellow
$activeTunnelUrl = $null

if ($cloudflaredPath) {
    $tunnelProc = Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Select-Object -First 1

    # Check if the existing tunnel process is in an expired / dead loop
    if (Test-Path $tunnelLog) {
        $recentLog = Get-Content -Path $tunnelLog -Tail 15 -ErrorAction SilentlyContinue
        if ($recentLog -match 'Unauthorized: Tunnel not found') {
            Write-Host "  [NOTICE] Previous Quick Tunnel session expired on Cloudflare's servers." -ForegroundColor Yellow
            Write-Host "  Restarting cloudflared to establish a fresh tunnel connection..." -ForegroundColor Cyan
            if ($tunnelProc) {
                Stop-Process -Id $tunnelProc.Id -Force -ErrorAction SilentlyContinue
                $tunnelProc = $null
            }
            Clear-Content -Path $tunnelLog -ErrorAction SilentlyContinue
        }
    }

    if ($tunnelProc) {
        Write-Host "  [OK] Cloudflare Tunnel process is already active (PID: $($tunnelProc.Id))" -ForegroundColor Green
    } else {
        # Clear stale log before launching so we only capture current session URL
        if (Test-Path $tunnelLog) {
            Clear-Content -Path $tunnelLog -ErrorAction SilentlyContinue
        }
        Write-Host "  Launching Cloudflare Quick Tunnel in a new window..." -ForegroundColor Cyan
        $tunnelCmd = ('title PayRoute Cloudflare Tunnel & "{0}" tunnel --url http://localhost:{1} --logfile "{2}"' -f $cloudflaredPath, $Port, $tunnelLog)
        Start-Process -FilePath "cmd.exe" -ArgumentList @('/k', $tunnelCmd) -WorkingDirectory $rootDir
        Write-Host "  Waiting for public tunnel URL to register..." -NoNewline
        for ($i = 0; $i -lt 30; $i++) {
            Start-Sleep -Seconds 1
            Write-Host "." -NoNewline
            if (Test-Path $tunnelLog) {
                $logTail = Get-Content -Path $tunnelLog -Tail 20 -ErrorAction SilentlyContinue
                if ($logTail -match '(https://[a-zA-Z0-9-]+\.trycloudflare\.com)') {
                    break
                }
            }
        }
        Write-Host ""
    }

    # Extract latest active trycloudflare URL from log
    if (Test-Path $tunnelLog) {
        $logLines = Get-Content -Path $tunnelLog -ErrorAction SilentlyContinue
        if ($logLines) {
            $logContent = $logLines -join "`n"
            $urlMatches = [regex]::Matches($logContent, 'https://[a-zA-Z0-9-]+\.trycloudflare\.com')
            if ($urlMatches.Count -gt 0) {
                $activeTunnelUrl = $urlMatches[$urlMatches.Count - 1].Value
            }
        }
    }
}

if ($activeTunnelUrl) {
    Write-Host "  [OK] Active Tunnel URL: $activeTunnelUrl" -ForegroundColor Green
    $tunOk = $false
    try {
        $tunHealth = (Invoke-WebRequest -Uri "$activeTunnelUrl/api/health" -UseBasicParsing -TimeoutSec 5).Content
        if ($tunHealth -like '*"ok"*') { $tunOk = $true }
    } catch {}

    if (-not $tunOk) {
        try {
            $curlOut = & curl.exe -s --max-time 5 "$activeTunnelUrl/api/health" 2>$null
            if ($curlOut -like '*"ok"*') { $tunOk = $true }
        } catch {}
    }

    if ($tunOk) {
        Write-Host "  [OK] Public tunnel endpoint verified: $activeTunnelUrl/api/health -> 200 OK" -ForegroundColor Green
    } else {
        Write-Host "  [WARNING] Public tunnel URL registered, but health endpoint is still propagating or DNS is pending." -ForegroundColor Yellow
    }
} else {
    Write-Host "  [WARNING] Could not determine public tunnel URL. Check tunnel console or log." -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# 5. Frontend & Tunnel Alignment Detection (Requirement 11)
# ---------------------------------------------------------------------------
Write-Host "[5/5] Checking Cloudflare Pages Dashboard Alignment..." -ForegroundColor Yellow

$deployedApiUrl = $null
try {
    $dashHtml = (Invoke-WebRequest -Uri "$DashboardUrl/" -UseBasicParsing -TimeoutSec 6).Content
    if ($dashHtml -match 'src="(/assets/index-[^"]+\.js)"') {
        $bundlePath = $Matches[1]
        $bundleUrl = "$DashboardUrl$bundlePath"
        $bundleJs = (Invoke-WebRequest -Uri $bundleUrl -UseBasicParsing -TimeoutSec 6).Content
        if ($bundleJs -match '(https://[a-zA-Z0-9-]+\.trycloudflare\.com/api)') {
            $deployedApiUrl = $Matches[1]
        }
    }
} catch {
    Write-Host "  [NOTE] Could not inspect remote bundle: $($_.Exception.Message)" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "                    PAYROUTE STATUS SUMMARY                 " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Local API:           http://localhost:$Port" -ForegroundColor White
Write-Host "  Local Health:        http://localhost:$Port/api/health" -ForegroundColor White
Write-Host "  Local Readiness:     http://localhost:$Port/api/ready" -ForegroundColor White
Write-Host "  BullMQ Worker:       Running (Redis Queues: payments, webhooks, maintenance)" -ForegroundColor White
Write-Host "  Cloudflare Pages:    $DashboardUrl" -ForegroundColor White

if ($activeTunnelUrl) {
    Write-Host "  Public Tunnel API:   $activeTunnelUrl/api" -ForegroundColor White
}

Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray

if ($activeTunnelUrl -and $tunOk) {
    $dynamicDashboardUrl = "$DashboardUrl/?api=$activeTunnelUrl/api"
    Write-Host "  Dynamic Dashboard Link (Instant Connection):" -ForegroundColor Cyan
    Write-Host "  $dynamicDashboardUrl" -ForegroundColor Green
    Write-Host "  (Approach A runtime resolution: no frontend rebuild required!)" -ForegroundColor DarkGray
    Write-Host ""
} elseif ($activeTunnelUrl -and (-not $tunOk)) {
    Write-Host "  [WARNING] Public tunnel health check did not respond 200 OK." -ForegroundColor Yellow
    Write-Host "  Dashboard link withheld until $activeTunnelUrl/api/health becomes reachable." -ForegroundColor DarkGray
    Write-Host ""
}

if ($activeTunnelUrl -and $deployedApiUrl) {
    $expectedTunnelApi = "$activeTunnelUrl/api"
    if ($expectedTunnelApi -eq $deployedApiUrl) {
        Write-Host "  [ALIGNED] Deployed bundle default matches active tunnel!" -ForegroundColor Green
        Write-Host "  Direct dashboard: $DashboardUrl" -ForegroundColor Green
    } else {
        Write-Host "  [INFO] Bundle default differs from current tunnel:" -ForegroundColor DarkGray
        Write-Host "    Current Tunnel:   $expectedTunnelApi" -ForegroundColor DarkGray
        Write-Host "    Deployed Default: $deployedApiUrl" -ForegroundColor DarkGray
        Write-Host "    -> Use the Dynamic Dashboard Link above to connect immediately." -ForegroundColor Cyan
    }
} elseif ($activeTunnelUrl) {
    Write-Host "  [INFO] Active Tunnel: $activeTunnelUrl/api" -ForegroundColor Cyan
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "To stop all PayRoute services cleanly, double-click STOP-PAYROUTE.bat" -ForegroundColor Gray
Write-Host ""
